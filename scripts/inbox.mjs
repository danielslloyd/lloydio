#!/usr/bin/env node
// List unprocessed inbox items (notes with `inbox: true`).
//
//   npm run inbox            human-readable table
//   npm run inbox -- --json  machine-readable, for scripts/local models
//
// This is the entry point for any processing agent (Claude Cowork, a local
// model, or you): get the list, open each file, categorize/clean it, and
// remove the `inbox: true` line when done. See .claude/skills/process-inbox.

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const NOTES_DIR = path.join(ROOT, 'src/content/notes');
const JSON_OUT = process.argv.includes('--json');

const items = [];
for (const f of fs.readdirSync(NOTES_DIR).filter((f) => f.endsWith('.md'))) {
  const raw = fs.readFileSync(path.join(NOTES_DIR, f), 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) continue;
  let data;
  try {
    data = YAML.parse(m[1]) ?? {};
  } catch {
    continue;
  }
  if (!data.inbox) continue;
  items.push({
    file: `src/content/notes/${f}`,
    title: data.title ?? null,
    url: data.url ?? null,
    date: data.date ?? null,
    tags: data.tags ?? [],
    source: data.source ?? null,
    draft: Boolean(data.draft),
    body_preview: m[2].trim().slice(0, 200),
  });
}

items.sort((a, b) => String(a.date).localeCompare(String(b.date)));

if (JSON_OUT) {
  console.log(JSON.stringify(items, null, 2));
} else {
  console.log(`${items.length} inbox item(s)\n`);
  for (const i of items) {
    console.log(`• ${i.title ?? i.url ?? '(untitled)'}`);
    console.log(`  ${i.file}${i.tags.length ? '  #' + i.tags.join(' #') : ''}`);
  }
}
