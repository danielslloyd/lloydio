#!/usr/bin/env node
// Ingest a Google Keep export (Google Takeout) into the notes inbox.
//
// Every Keep note becomes src/content/notes/keep-<date>-<slug>-<hash>.md
// with `inbox: true` and `draft: true` — visible only in owner mode until
// the process-inbox skill (or you) reviews, tags, and publishes it.
// Image/audio attachments are copied to public/media/keep/.
//
// Usage:
//   npm run ingest-keep -- ~/Downloads/Takeout/Keep
//   node scripts/ingest-keep.mjs <keep-dir> [--force]
//
// Idempotent: output filenames are derived from the source file, so
// re-running skips notes that were already imported (--force overwrites).

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const OUT_DIR = path.join(ROOT, 'src/content/notes');
const MEDIA_DIR = path.join(ROOT, 'public/media/keep');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const FORCE = process.argv.includes('--force');
const inDir = args[0];
if (!inDir || !fs.existsSync(inDir)) {
  console.error('usage: node scripts/ingest-keep.mjs <path-to-Takeout/Keep> [--force]');
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const files = fs.readdirSync(inDir).filter((f) => f.endsWith('.json'));
let imported = 0, skipped = 0, trashed = 0;

for (const file of files) {
  let keep;
  try {
    keep = JSON.parse(fs.readFileSync(path.join(inDir, file), 'utf8'));
  } catch {
    console.warn(`skip (bad JSON): ${file}`);
    continue;
  }
  if (keep.isTrashed) { trashed += 1; continue; }

  const usec = keep.userEditedTimestampUsec || keep.createdTimestampUsec;
  const date = usec ? new Date(Number(usec) / 1000) : new Date();
  const day = date.toISOString().slice(0, 10);

  const title = (keep.title || '').trim();
  const text = (keep.textContent || '').trim();
  const fallbackTitle = text.split(/\s+/).slice(0, 8).join(' ');
  const displayTitle = title || fallbackTitle || undefined;

  const links = (keep.annotations || []).filter((a) => a.url);
  const primaryUrl = links[0]?.url;

  const slug =
    (displayTitle || 'note')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'note';
  const hash = fnv1a(file);
  const outName = `keep-${day}-${slug}-${hash}.md`;
  const outPath = path.join(OUT_DIR, outName);
  if (fs.existsSync(outPath) && !FORCE) { skipped += 1; continue; }

  // Copy attachments and build embeds.
  const embeds = [];
  for (const att of keep.attachments || []) {
    if (!att.filePath) continue;
    const src = resolveAttachment(inDir, att.filePath);
    if (!src) { console.warn(`  missing attachment ${att.filePath} (${file})`); continue; }
    const destName = `${hash}-${path.basename(src)}`;
    fs.copyFileSync(src, path.join(MEDIA_DIR, destName));
    if ((att.mimetype || '').startsWith('image/')) {
      embeds.push(`![](/media/keep/${destName})`);
    } else if ((att.mimetype || '').startsWith('audio/')) {
      embeds.push(`<audio controls src="/media/keep/${destName}"></audio>`);
    } else {
      embeds.push(`[attachment](/media/keep/${destName})`);
    }
  }

  const tags = (keep.labels || []).map((l) =>
    l.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  );

  const bodyParts = [];
  if (text) bodyParts.push(text);
  if (keep.listContent?.length) {
    bodyParts.push(
      keep.listContent.map((i) => `- [${i.isChecked ? 'x' : ' '}] ${i.text}`).join('\n')
    );
  }
  if (links.length > (primaryUrl ? 1 : 0)) {
    bodyParts.push(
      links
        .slice(primaryUrl ? 1 : 0)
        .map((l) => `- [${l.title || l.url}](${l.url})`)
        .join('\n')
    );
  }
  if (embeds.length) bodyParts.push(embeds.join('\n\n'));

  const fm = [
    '---',
    displayTitle ? `title: ${JSON.stringify(displayTitle)}` : null,
    primaryUrl ? `url: ${JSON.stringify(primaryUrl)}` : null,
    `date: ${date.toISOString()}`,
    tags.length ? `tags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]` : null,
    'draft: true',
    'inbox: true',
    'source: keep',
    keep.isArchived ? '# keep: was archived' : null,
    keep.isPinned ? '# keep: was pinned' : null,
    '---',
  ].filter(Boolean);

  fs.writeFileSync(outPath, `${fm.join('\n')}\n\n${bodyParts.join('\n\n')}\n`);
  imported += 1;
}

console.log(
  `imported ${imported}, skipped ${skipped} already-imported, ignored ${trashed} trashed ` +
    `(of ${files.length} Keep notes)`
);
console.log('next: review with `npm run inbox` or the process-inbox skill');

function resolveAttachment(dir, filePath) {
  // Takeout sometimes writes .jpeg in JSON but .jpg on disk (and vice versa).
  const candidates = [
    filePath,
    filePath.replace(/\.jpeg$/, '.jpg'),
    filePath.replace(/\.jpg$/, '.jpeg'),
  ];
  for (const c of candidates) {
    const p = path.join(dir, c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 6);
}
