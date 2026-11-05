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

  const out = {
    asin,
    url,
    title: '',
    author: '',
    cover: '',
    goodreads: '',
    audible: '',
    confidence: 'none',
  };

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
  out.goodreads = await goodreadsPage(asin);
  // Low-confidence titles (URL slug guesses) could match the wrong audiobook.
  if (out.confidence === 'high') out.audible = await audiblePage(out.title, out.author);
  return out;
}

// ---- books.yaml helpers (pure text, line-scoped) ---------------------------

// Title of the entry that already lists this ASIN (as its id or inside any
// link), '' if it has no title, or null when the ASIN isn't in the file.
// `exceptId` skips one entry (the one being rewritten by a clean-up).
export function findDuplicate(text, asin, exceptId) {
  const blocks = text.split(/\r?\n(?=- )/);
  const idRe = new RegExp(`^- id:\\s*"?${asin}"?\\s*$`, 'm');
  const skipRe = exceptId ? new RegExp(`^- id:\\s*"?${exceptId}"?\\s*$`, 'm') : null;
  for (const b of blocks) {
    if (skipRe && skipRe.test(b)) continue;
    if (idRe.test(b) || b.includes(`/${asin}`)) {
      const t = b.match(/^\s+title:\s*(.*)$/m);
      return t ? t[1].trim().replace(/^"|"$/g, '') : '';
    }
  }
  return null;
}

// Amazon product link plus the Goodreads/Audible pages the lookup found,
// falling back to *search* links (BookRow grays those out, so they read as
// "not yet pinned down").
export function bookLinks({ asin, title, author, goodreads, audible }) {
  const q = encodeURIComponent(
    [title.replace(/:.*$/, ''), (author || '').split(',')[0]].filter(Boolean).join(' ')
  );
  return {
    amazon: `https://www.amazon.com/dp/${asin}`,
    goodreads: goodreads || `https://www.goodreads.com/search?q=${q}`,
    audible: audible || `https://www.audible.com/search?keywords=${q}`,
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

// Audible product page for a title/author, via Audible's public catalog API.
// (Amazon's "Audible Audio Edition" ASIN often isn't Audible's, so an Amazon
// audiobook link can't be turned into an audible.com one.) Only a match on
// both the main title and the first author's surname counts; '' otherwise.
export async function audiblePage(title, author) {
  const norm = (s) =>
    String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').replace(/^(the|a|an) /, '').trim();
  // Drop series tags like "(Hyperion Cantos, #1)"; keep "Targeted: Beirut"-style
  // short titles whole, otherwise compare the part before the subtitle.
  const full = String(title || '').replace(/\s*\([^)]*#[^)]*\)\s*/g, ' ').trim();
  const firstAuthor = String(author || '').split(/,| and /)[0].replace(/[’‘]/g, "'").trim();
  const last = norm(firstAuthor).split(' ').pop();
  if (!full) return '';
  const q = new URLSearchParams({
    title: full.split(/[:;]/)[0].trim(),
    num_results: '10',
    response_groups: 'contributors,product_desc',
    products_sort_by: 'Relevance',
  });
  if (firstAuthor) q.set('author', firstAuthor);
  const data = await getJson(`https://api.audible.com/1.0/catalog/products?${q}`);
  const want = norm(full);
  const head = norm(full.split(/[:;]/)[0]);
  // Prefer the longest title that matches, so "Targeted: Beirut" beats "Targeted: Pan Am 103".
  const hit = (data?.products || [])
    .filter((p) => {
      const pt = norm(p.title);
      // Exact, a shorter form of the full title, or the bare main title — never
      // a different book that merely shares the first word ("The Quartet Murders").
      const titleOk = pt === want || pt === head || want.startsWith(pt + ' ');
      const authorOk = !last || (p.authors || []).some((a) => norm(a.name).includes(last));
      return titleOk && authorOk;
    })
    .sort((a, b) => b.title.length - a.title.length)[0];
  return hit ? `https://www.audible.com/pd/${hit.asin}` : '';
}

// ---- clean-up search: title (+ author) → up to 10 candidate listings -------
//
// Backs the owner-mode "clean up" picker on /books drafts. Amazon blocks
// automated search, so listings come from two open catalogs, each mapped to
// an ASIN Amazon/Audible understand:
//   - Open Library: print editions; the ISBN-10 *is* the Amazon ASIN.
//   - Audible's catalog API: audiobooks; authors and narrators are separate,
//     which is exactly what fixes "narrator listed as author" drafts.
// Audible gets title + author as free keywords (so a narrator's name still
// finds the right audiobook); Open Library gets them as fields, retrying on
// title alone when the "author" was really a narrator.
//
// Each candidate: { asin, format: 'print'|'audiobook', title, author,
// narrators, year, edition, cover, url, source }.
export async function searchListings({ title, author = '', prefer = 'audiobook', limit = 10 }) {
  title = String(title || '').trim();
  author = String(author || '').trim();
  if (!title) return [];
  const [audio, print] = await Promise.all([
    audibleSearch(`${title} ${author}`.trim()),
    openLibrarySearch(title, author),
  ]);
  // Rank by how well the title matches, then interleave the two sources so
  // both formats show up near the top; the entry's current format (ISBN id →
  // print) leads within a tier.
  const want = normTitle(title);
  const score = (c) => {
    const t = normTitle(c.title);
    if (t === want) return 3;
    if (t.startsWith(want + ' ') || want.startsWith(t + ' ')) return 2;
    return t.includes(want) || want.includes(t) ? 1 : 0;
  };
  const tag = (list, lead) => list.map((c, i) => ({ c, s: score(c), i, lead }));
  const ranked = [...tag(audio, prefer !== 'print'), ...tag(print, prefer === 'print')]
    .sort((x, y) => y.s - x.s || x.i - y.i || y.lead - x.lead);
  const out = [];
  const seen = new Set();
  for (const { c } of ranked) {
    if (out.length >= limit) break;
    if (seen.has(c.asin)) continue;
    seen.add(c.asin);
    out.push(c);
  }
  return out;
}

// Main title only, lowercased, no articles/punctuation: "The Battle of
// Arnhem: The Deadliest…" → "battle of arnhem".
function normTitle(s) {
  return String(s || '')
    .split(/[:;([]/)[0]
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

async function audibleSearch(keywords) {
  const q = new URLSearchParams({
    keywords,
    num_results: '10',
    products_sort_by: 'Relevance',
    response_groups: 'contributors,product_desc,product_attrs,media',
    image_sizes: '500',
  });
  const data = await getJson(`https://api.audible.com/1.0/catalog/products?${q}`);
  const people = (list) => (list || []).map((p) => String(p.name || '').trim()).filter(Boolean);
  return (data?.products || [])
    // Books only — not podcasts, episodes or "[Review]" stubs.
    .filter((p) => /^(Single|Multi)PartBook$/.test(p.content_delivery_type || '') && p.title)
    .map((p) => {
      let authors = people(p.authors);
      // Contributor roles ride along in the name ("X - translator",
      // "Y (Foreword By)"); "The Great Courses" is the publisher. Keep the
      // real authors when there are any.
      const real = authors.filter((n) => !/\s[-–—]\s|\(|^the great courses$/i.test(n));
      if (real.length) authors = real;
      const narrators = people(p.narrators);
      return {
        asin: p.asin,
        format: 'audiobook',
        title: p.subtitle ? `${p.title}: ${p.subtitle}` : p.title,
        author: authors.slice(0, 3).join(', '),
        narrators: narrators.slice(0, 3).join(', ') + (narrators.length > 3 ? ', …' : ''),
        year: String(p.release_date || '').slice(0, 4),
        edition: [p.publisher_name, p.format_type].filter(Boolean).join(' · '),
        cover: (p.product_images && (p.product_images['500'] || Object.values(p.product_images)[0])) || '',
        url: `https://www.audible.com/pd/${p.asin}`,
        source: 'Audible',
      };
    });
}

async function openLibrarySearch(title, author) {
  const fields = [
    'key', 'title', 'subtitle', 'author_name', 'first_publish_year', 'cover_i',
    'editions', 'editions.key', 'editions.isbn', 'editions.cover_i',
    'editions.publish_date', 'editions.publisher',
  ].join(',');
  const run = async (withAuthor) => {
    const q = new URLSearchParams({ title, limit: '10', lang: 'en', fields });
    if (withAuthor) q.set('author', withAuthor);
    const data = await getJson(`https://openlibrary.org/search.json?${q}`);
    return data?.docs || [];
  };
  let works = author ? await run(author) : [];
  if (works.length < 3) {
    const more = await run('');
    const have = new Set(works.map((w) => w.key));
    works = works.concat(more.filter((w) => !have.has(w.key)));
  }
  works = works.slice(0, 10);

  // The edition Open Library matched may predate ISBNs; then look through the
  // work's other editions for one Amazon can address.
  const picked = await Promise.all(
    works.map(async (w) => {
      const ed = (w.editions?.docs || [])[0] || {};
      let isbn = isbn10Of(ed.isbn);
      let edition = ed;
      if (!isbn && w.key) {
        const all = await getJson(`https://openlibrary.org${w.key}/editions.json?limit=50`);
        const withIsbn = (all?.entries || [])
          .map((e) => ({ e, isbn: isbn10Of([...(e.isbn_10 || []), ...(e.isbn_13 || [])]) }))
          .filter((x) => x.isbn)
          // English first, then newest.
          .sort((x, y) => english(y.e) - english(x.e) || yearOf(y.e.publish_date) - yearOf(x.e.publish_date))[0];
        if (withIsbn) {
          isbn = withIsbn.isbn;
          edition = {
            publish_date: withIsbn.e.publish_date,
            publisher: withIsbn.e.publishers,
            cover_i: (withIsbn.e.covers || [])[0],
          };
        }
      }
      if (!isbn) return null;
      const coverId = edition.cover_i || w.cover_i;
      const published = Array.isArray(edition.publish_date) ? edition.publish_date[0] : edition.publish_date;
      return {
        asin: isbn,
        format: 'print',
        title: w.subtitle ? `${w.title}: ${w.subtitle}` : w.title,
        author: (w.author_name || []).slice(0, 3).join(', '),
        narrators: '',
        year: w.first_publish_year ? String(w.first_publish_year) : '',
        edition: [(edition.publisher || [])[0], published].filter(Boolean).join(' · '),
        cover: coverId && coverId > 0 ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : '',
        url: `https://www.amazon.com/dp/${isbn}`,
        source: 'Open Library',
      };
    })
  );
  return picked.filter(Boolean);
}

// First ISBN-10 in a list, converting a 978- ISBN-13 when that's all there is.
function isbn10Of(list) {
  const ids = (list || []).map((s) => String(s).replace(/[^0-9X]/gi, '').toUpperCase());
  const ten = ids.find((s) => /^\d{9}[\dX]$/.test(s));
  if (ten) return ten;
  const thirteen = ids.find((s) => /^978\d{10}$/.test(s));
  if (!thirteen) return '';
  const core = thirteen.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(core[i]);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? 'X' : String(check));
}

const english = (e) => ((e.languages || []).some((l) => l.key === '/languages/eng') ? 1 : 0);
const yearOf = (d) => Number((String(d || '').match(/\d{4}/) || [0])[0]);

// Amazon's ASIN-addressed image endpoint. Missing images come back as a tiny
// placeholder gif, so require a real payload.
export async function amazonCover(asin) {
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

// Goodreads resolves ISBNs and Amazon ASINs (Kindle too) at /book/isbn/<id>,
// redirecting to the book's page. '' when it doesn't know the id.
export async function goodreadsPage(asin) {
  try {
    const res = await fetch(`https://www.goodreads.com/book/isbn/${asin}`, {
      redirect: 'manual',
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(5000),
    });
    const loc = res.headers.get('Location') || '';
    const m = loc.match(/^(?:https:\/\/www\.goodreads\.com)?(\/book\/show\/[^?#]+)/);
    return m ? `https://www.goodreads.com${m[1]}` : '';
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
