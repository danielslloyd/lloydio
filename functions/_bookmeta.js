// Amazon link → book metadata, for the owner-mode "add a book" box on /books
// (functions/api/books.js, action `add`). Files prefixed with `_` are not
// routed by Cloudflare Pages; this exists only to be imported.
//
// Amazon blocks a lot of bot traffic, so the page scrape is only one source
// among several. In order:
//   1. ISBN-10 ASINs (print editions) → Open Library, then Google Books.
//   2. Best-effort fetch of the Amazon product page (main path for Kindle B0…).
//   3. Title words in the URL slug → Google Books search (low confidence).
// Covers stay hotlinked from Amazon's CDN, never self-hosted.
//
// Returns { asin, url, title, author, cover, confidence } where confidence is
// 'high' | 'low' | 'none' ('none' = no title found; caller should queue), or
// null when no ASIN can be extracted at all.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

const ASIN_RE = /\/(?:dp|gp\/product|gp\/aw\/d|ebook\/dp|d)\/([A-Z0-9]{10})(?=[/?#]|$)/i;

export function extractAsin(url) {
  const m = String(url).match(ASIN_RE);
  return m ? m[1].toUpperCase() : null;
}

export async function lookupAmazon(rawUrl) {
  let url = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  let asin = extractAsin(url);
  if (!asin) {
    // Short links (a.co / amzn.to / amzn.eu) redirect to the product page.
    url = (await resolveRedirects(url)) || url;
    asin = extractAsin(url);
  }
  if (!asin) return null;

  const out = { asin, url, title: '', author: '', cover: '', confidence: 'none' };

  // 1) Print ISBN-10.
  if (/^\d{9}[\dX]$/.test(asin)) {
    const hit = (await openLibrary(asin)) || (await googleBooks(`isbn:${asin}`));
    if (hit) Object.assign(out, hit, { confidence: 'high' });
  }

  // 2) The product page itself (title, byline, high-res cover).
  const page = await scrapeAmazon(asin);
  if (page) {
    if (!out.title && page.title) {
      out.title = page.title;
      out.confidence = 'high';
    }
    if (!out.author && page.author) out.author = page.author;
    if (page.cover) out.cover = page.cover;
  }

  // 3) URL slug → Google Books search.
  if (!out.title) {
    const words = slugWords(url);
    if (words) {
      const hit = await googleBooks(`intitle:${words}`);
      if (hit) {
        out.title = hit.title;
        out.author = out.author || hit.author;
      } else {
        out.title = words;
      }
      out.confidence = 'low';
    }
  }

  if (!out.cover) out.cover = await amazonCover(asin);
  return out;
}

// ---- books.yaml helpers (pure text, line-scoped) ---------------------------

// Title of the entry that already lists this ASIN (as its id or inside any
// link), '' if it has no title, or null when the ASIN isn't in the file.
export function findDuplicate(text, asin) {
  const blocks = text.split(/\r?\n(?=- )/);
  const idRe = new RegExp(`^- id:\\s*"?${asin}"?\\s*$`, 'm');
  for (const b of blocks) {
    if (idRe.test(b) || b.includes(`/${asin}`)) {
      const t = b.match(/^\s+title:\s*(.*)$/m);
      return t ? t[1].trim().replace(/^"|"$/g, '') : '';
    }
  }
  return null;
}

// Amazon product link plus Goodreads/Audible *search* links (BookRow grays
// search links out, so they read as "not yet pinned down").
export function bookLinks({ asin, title, author }) {
  const q = encodeURIComponent(
    [title.replace(/:.*$/, ''), (author || '').split(',')[0]].filter(Boolean).join(' ')
  );
  return {
    amazon: `https://www.amazon.com/dp/${asin}`,
    goodreads: `https://www.goodreads.com/search?q=${q}`,
    audible: `https://www.audible.com/search?keywords=${q}`,
  };
}

// Append one entry in the file's field order, keeping its line endings.
// JSON.stringify yields valid YAML double-quoted scalars.
export function appendEntry(text, e) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const block = [
    `- id: ${JSON.stringify(e.id)}`,
    `  title: ${JSON.stringify(e.title)}`,
    e.author ? `  author: ${JSON.stringify(e.author)}` : null,
    `  date: ${e.date}`,
    `  status: ${e.status}`,
    '  links:',
    ...Object.entries(e.links).map(([k, v]) => `    ${k}: ${v}`),
    '  source: amazon',
    e.draft ? '  draft: true' : null,
    e.cover ? `  cover: ${e.cover}` : null,
  ].filter((l) => l !== null);
  const base = text === '' || text.endsWith('\n') ? text : text + eol;
  return base + block.join(eol) + eol;
}

// ---- sources -------------------------------------------------------------

async function openLibrary(isbn) {
  const ed = await getJson(`https://openlibrary.org/isbn/${isbn}.json`);
  if (!ed || !ed.title) return null;
  const title = ed.subtitle ? `${ed.title}: ${ed.subtitle}` : ed.title;
  const names = [];
  for (const a of (ed.authors || []).slice(0, 3)) {
    const au = a && a.key ? await getJson(`https://openlibrary.org${a.key}.json`) : null;
    if (au && au.name) names.push(au.name);
  }
  return { title, author: names.join(', ') };
}

async function googleBooks(q) {
  const data = await getJson(
    `https://www.googleapis.com/books/v1/volumes?maxResults=1&q=${encodeURIComponent(q)}`
  );
  const v = data && data.items && data.items[0] && data.items[0].volumeInfo;
  if (!v || !v.title) return null;
  return {
    title: v.subtitle ? `${v.title}: ${v.subtitle}` : v.title,
    author: (v.authors || []).slice(0, 3).join(', '),
  };
}

async function scrapeAmazon(asin) {
  let html;
  try {
    const res = await fetch(`https://www.amazon.com/dp/${asin}`, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }
  // Robot check / captcha page.
  if (/captcha|api-services-support@amazon\.com/i.test(html) && !/id="productTitle"/.test(html)) {
    return null;
  }

  const text = (s) => decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

  let title = text((html.match(/id="productTitle"[^>]*>([\s\S]*?)<\/span>/) || [])[1]);
  if (!title) title = text((html.match(/<meta[^>]+(?:name|property)="(?:og:)?title"[^>]+content="([^"]+)"/) || [])[1]);
  // og/meta titles look like "Amazon.com: Title: Author: Books" — keep the title part.
  title = title.replace(/^Amazon\.com:\s*/i, '').replace(/\s*:\s*[^:]*:\s*(?:Books|Kindle Store|Audible[^:]*)$/i, '');

  // Byline: one <span class="author"> per contributor, each with a role like
  // "(Author, Narrator)". Keep authors; drop narrators/translators/etc.
  const authors = [];
  for (const m of html.matchAll(/<span class="author[^"]*"[^>]*>\s*<a[^>]*>([^<]+)<\/a>([\s\S]{0,300}?)<\/span>\s*<\/span>/g)) {
    const name = text(m[1]);
    const role = text(m[2]);
    if (!name || /full cast/i.test(name)) continue;
    if (role && !/\bAuthor\b/i.test(role)) continue;
    if (!authors.includes(name)) authors.push(name);
    if (authors.length === 3) break;
  }

  // Cover: the main product <img>; attribute order varies, so grab the tag.
  const imgTag =
    (html.match(/<img[^>]*id="(?:landingImage|imgBlkFront|ebooksImgBlkFront)"[^>]*>/) || [])[0] || '';
  let cover = (imgTag.match(/data-old-hires="(https:[^"]+)"/) || [])[1] || (imgTag.match(/\ssrc="(https:[^"]+)"/) || [])[1] || '';
  // Normalize to the thumbnail size the rest of books.yaml uses.
  cover = cover.replace(/\._[^/]*_\.(jpg|png)$/i, '._SY300_.$1');

  if (!title) return null;
  return { title, author: authors.join(', '), cover };
}

// Amazon's ASIN-addressed image endpoint. Missing images come back as a tiny
// placeholder gif, so require a real payload.
async function amazonCover(asin) {
  const url = `https://m.media-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_.jpg`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return '';
    const buf = await res.arrayBuffer();
    return buf.byteLength > 1000 ? url : '';
  } catch {
    return '';
  }
}

// ---- helpers -------------------------------------------------------------

async function resolveRedirects(url) {
  let cur = url;
  for (let i = 0; i < 5; i++) {
    let res;
    try {
      res = await fetch(cur, {
        redirect: 'manual',
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      return null;
    }
    const loc = res.headers.get('Location');
    if (!loc || res.status < 300 || res.status >= 400) return cur;
    cur = new URL(loc, cur).toString();
    if (extractAsin(cur)) return cur;
  }
  return cur;
}

// "https://www.amazon.com/Albions-Seed-British-Folkways-America/dp/0195069056"
// → "Albions Seed British Folkways America"
function slugWords(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const i = parts.findIndex((p) => /^(dp|gp)$/i.test(p));
    const slug = i > 0 ? parts[i - 1] : '';
    if (!slug || /^[A-Z0-9]{10}$/i.test(slug)) return '';
    return decodeURIComponent(slug).replace(/[-_+]+/g, ' ').trim();
  } catch {
    return '';
  }
}

async function getJson(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'lloydio-books', Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
