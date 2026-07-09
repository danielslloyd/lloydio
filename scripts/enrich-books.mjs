#!/usr/bin/env node
// One-off enrichment for src/content/books.yaml.
//
// For each book with a Goodreads link, fetch the Goodreads page and extract:
//   - the live cover image URL (Amazon/Goodreads CDN — never self-hosted)
//   - the ISBN, used to upgrade the Amazon search link into a specific
//     /dp/<isbn10> product link ("live/specific" instead of a search).
//
// Audible has no public per-book id here, so it stays a search link (grayed
// out in the UI). Failures are skipped — we keep whatever we can get.
//
//   node scripts/enrich-books.mjs [--limit N] [--force]
//
// Re-runnable: books that already have a `cover` are skipped unless --force.

import { readFile, writeFile } from 'node:fs/promises';
import YAML from 'yaml';

const BOOKS = 'src/content/books.yaml';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

const args = process.argv.slice(2);
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const force = args.includes('--force');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ISBN-13 (978-prefixed) -> ISBN-10, so we can build an Amazon /dp/ link.
function isbn13to10(isbn13) {
  if (!/^978\d{10}$/.test(isbn13)) return null;
  const core = isbn13.slice(3, 12); // drop 978 prefix + old check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(core[i]);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? 'X' : String(check));
}

function extract(html) {
  const cover = html.match(
    /https:\/\/[^"']*compressed\.photo\.goodreads\.com\/books\/\d+i\/\d+\.jpg/
  );
  // Collect every quoted isbn/isbn13 value (closing quote required so we
  // never grab a 10-digit prefix of a 13-digit number).
  const vals = [...html.matchAll(/"isbn(?:13)?":"([0-9X]{10,13})"/g)].map((m) => m[1]);
  let isbn10 = vals.find((v) => v.length === 10) || null;
  if (!isbn10) {
    const isbn13 = vals.find((v) => v.length === 13);
    if (isbn13) isbn10 = isbn13to10(isbn13);
  }
  return { cover: cover ? cover[0] : null, isbn10 };
}

async function fetchBook(id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`https://www.goodreads.com/book/show/${id}`, {
        headers: { 'User-Agent': UA },
      });
      if (r.status === 200) return extract(await r.text());
      if (r.status === 404) return { cover: null, isbn10: null };
    } catch {
      /* retry */
    }
    await sleep(1000 * (attempt + 1));
  }
  return null; // give up, leave book untouched
}

const goodreadsId = (b) => {
  const gr = b.links?.goodreads;
  const m = gr && gr.match(/\/book\/show\/(\d+)/);
  return m ? m[1] : null;
};

const raw = await readFile(BOOKS, 'utf8');
const books = YAML.parse(raw);

let done = 0;
let covered = 0;
let linked = 0;
for (const b of books) {
  if (done >= limit) break;
  const id = goodreadsId(b);
  if (!id) continue;
  if (b.cover && !force) continue;

  const res = await fetchBook(id);
  done++;
  if (!res) {
    process.stderr.write(`  ! ${id} failed\n`);
    continue;
  }
  if (res.cover) {
    b.cover = res.cover;
    covered++;
  }
  if (res.isbn10) {
    b.links = b.links || {};
    b.links.amazon = `https://www.amazon.com/dp/${res.isbn10}`;
    linked++;
  }
  process.stderr.write(
    `  · ${id} ${res.cover ? 'cover' : '-----'} ${res.isbn10 ? 'isbn' : '----'} (${done})\n`
  );
  await sleep(350); // be polite
}

await writeFile(BOOKS, YAML.stringify(books, { lineWidth: 0 }));
console.log(`\nEnriched ${done} books: ${covered} covers, ${linked} amazon links.`);
