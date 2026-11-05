#!/usr/bin/env node
// Find audiobook (Audible) editions for books.yaml.
//
// Looks each book up in Audible's catalog by title + author (see audiblePage
// in functions/_bookmeta.js) and, on a confident match, sets links.audible to
// the audible.com product page — a specific/live link instead of the keyword
// search. Amazon "Audible Audio Edition" links are not used: their ASIN is
// often not Audible's, so they can't be turned into audible.com pages.
//
//   node scripts/enrich-audible.mjs [--limit N] [--force]
//
// Re-runnable: books whose audible link is already an audible.com product page
// are skipped unless --force. Amazon-hosted audible links are always retried.

import { readFile, writeFile } from 'node:fs/promises';
import YAML from 'yaml';
import { audiblePage } from '../functions/_bookmeta.js';

const BOOKS = 'src/content/books.yaml';

const args = process.argv.slice(2);
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const force = args.includes('--force');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const hasSpecificAudible = (b) => /^https:\/\/www\.audible\.com\/pd\//.test(b.links?.audible || '');

const raw = await readFile(BOOKS, 'utf8');
const books = YAML.parse(raw);

let done = 0;
let found = 0;
for (const b of books) {
  if (done >= limit) break;
  if (hasSpecificAudible(b) && !force) continue;

  const url = await audiblePage(b.title, b.author);
  done++;
  if (url) {
    b.links = b.links || {};
    b.links.audible = url;
    found++;
  }
  process.stderr.write(`  · ${b.title} ${url || '(no audiobook)'} (${done})\n`);
  await writeFile(BOOKS, YAML.stringify(books, { lineWidth: 0 })); // checkpoint each step
  await sleep(300);
}

process.stderr.write(`done: ${done} looked up, ${found} audiobook links set\n`);
