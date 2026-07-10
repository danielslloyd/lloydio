#!/usr/bin/env node
// One-off: find audiobook (Audible) editions for books.yaml.
//
// Amazon's print product page carries a format strip; when an audiobook
// edition exists, its swatch links to the "Audible Audio Edition" page
// (…/dp/<asin>/ref=tmm_aud_swatch…). We fetch each book's Amazon /dp/ page
// and, if that swatch is present, set links.audible to the audiobook page —
// a specific/live link instead of the keyword search.
//
//   node scripts/enrich-audible.mjs [--limit N] [--force]
//
// Re-runnable: books whose audible link is already specific (not a search)
// are skipped unless --force. Needs a specific Amazon /dp/ link to scrape.

import { readFile, writeFile } from 'node:fs/promises';
import YAML from 'yaml';

const BOOKS = 'src/content/books.yaml';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

const args = process.argv.slice(2);
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const force = args.includes('--force');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Persist cookies across requests — Amazon captchas anonymous, cookieless
// traffic far more aggressively than a warmed-up session.
const jar = new Map();
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
function absorb(res) {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
async function warmup() {
  try {
    const r = await fetch('https://www.amazon.com/', {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html' },
    });
    absorb(r);
    await r.text();
  } catch {
    /* best effort */
  }
}

const amazonAsin = (b) => {
  const az = b.links?.amazon;
  const m = az && az.match(/\/dp\/([A-Z0-9]{10})/);
  return m ? m[1] : null;
};

const hasSpecificAudible = (b) => {
  const au = b.links?.audible;
  return au && !/[?&]keywords=|\/search\b/.test(au);
};

async function audiobookAsin(printAsin) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`https://www.amazon.com/dp/${printAsin}`, {
        headers: {
          'User-Agent': UA,
          'Accept-Language': 'en-US,en;q=0.9',
          Accept: 'text/html',
          ...(jar.size ? { Cookie: cookieHeader() } : {}),
        },
      });
      absorb(r);
      const html = await r.text();
      if (/Enter the characters you see|api-services-support@amazon\.com/.test(html)) {
        process.stderr.write('  (captcha — backing off)\n');
        await sleep(5000 * (attempt + 1));
        continue;
      }
      if (r.status !== 200) return { blocked: false, asin: null };
      const m = html.match(/\/dp\/([A-Z0-9]{10})\/ref=tmm_aud_swatch/);
      return { blocked: false, asin: m ? m[1] : null };
    } catch {
      await sleep(1500 * (attempt + 1));
    }
  }
  return { blocked: true, asin: null };
}

const raw = await readFile(BOOKS, 'utf8');
const books = YAML.parse(raw);

await warmup();

let done = 0;
let found = 0;
for (const b of books) {
  if (done >= limit) break;
  if (hasSpecificAudible(b) && !force) continue;
  const asin = amazonAsin(b);
  if (!asin) continue;

  const { asin: audio } = await audiobookAsin(asin);
  done++;
  if (audio) {
    b.links = b.links || {};
    b.links.audible = `https://www.amazon.com/dp/${audio}`;
    found++;
  }
  process.stderr.write(`  · ${asin} ${audio ? 'audio=' + audio : 'no-audiobook'} (${done})\n`);
  await writeFile(BOOKS, YAML.stringify(books, { lineWidth: 0 })); // checkpoint each step
  await sleep(700);
}

console.log(`\nProcessed ${done} books; found ${found} audiobook editions.`);
