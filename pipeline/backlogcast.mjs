#!/usr/bin/env node
// BacklogCast queue viewer.
//
// Narration happens on the owner's desktop: the BacklogCast app polls
// /api/podcast-queue.json, extracts each link with Claude, narrates it with
// Henty (local GPU TTS), and POSTs the episode to /api/episode, which stores
// the mp3 in R2 and commits src/content/articles/<slug>.md. See
// docs/BACKLOGCAST.md. This script just lists what's waiting, straight from
// the repo:
//   queue = notes tagged `podcast` with a URL, minus existing articles
//         + articles still missing audio
//
// Usage:  npm run backlogcast   (alias: node pipeline/backlogcast.mjs [--dry-run])

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NOTES_DIR = path.join(ROOT, 'src/content/notes');
const ARTICLES_DIR = path.join(ROOT, 'src/content/articles');

// Keep in sync with articleSlug() in src/lib/reading.ts.
function articleSlug(title, url) {
  const u = new URL(url);
  const base =
    (title || u.hostname + u.pathname)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'article';
  return `${base}-${fnv1a(url)}`;
}
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 6);
}

function readMdDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
      if (!m) return null;
      let data;
      try {
        data = YAML.parse(m[1]) ?? {};
      } catch {
        return null;
      }
      return { file: f, data, body: m[2] ?? '' };
    })
    .filter(Boolean);
}

function collectQueue() {
  const articles = readMdDir(ARTICLES_DIR);
  const byUrl = new Map(articles.map((a) => [a.data.url, a]));
  const queue = [];

  for (const n of readMdDir(NOTES_DIR)) {
    const tags = n.data.tags ?? [];
    if (!tags.includes('podcast') || !n.data.url) continue;
    if (byUrl.has(n.data.url)) continue;
    queue.push({
      url: n.data.url,
      title: n.data.title,
      date: n.data.date ? new Date(n.data.date) : new Date(),
      tags: tags.filter((t) => t !== 'podcast'),
      existing: null,
    });
  }
  // Articles that exist but never got audio (e.g. TTS failed last run).
  for (const a of articles) {
    if (!a.data.audio) {
      queue.push({
        url: a.data.url,
        title: a.data.title,
        date: a.data.date ? new Date(a.data.date) : new Date(),
        tags: a.data.tags ?? [],
        existing: a,
      });
    }
  }
  return queue;
}

const queue = collectQueue();
console.log(`queue: ${queue.length} item(s)`);
for (const item of queue) {
  console.log(`\n→ ${item.url}\n  slug: ${articleSlug(item.title, item.url)}` +
    (item.existing ? '\n  (article exists, no audio yet)' : ''));
}
