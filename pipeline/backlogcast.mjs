#!/usr/bin/env node
// BacklogCast, absorbed: turn podcast-flagged links into narrated episodes.
//
// Reads the repo directly (no HTTP API needed):
//   queue   = notes tagged `podcast` with a URL, minus existing articles
//           + articles still missing audio
//   output  = src/content/articles/<slug>.md  (clean markdown of the text)
//           + public/media/audio/<slug>.mp3   (TTS narration via edge-tts)
//
// The private feed at /podcast/<token>.xml is generated from these files
// at site build time. See docs/BACKLOGCAST.md.
//
// Usage:  node pipeline/backlogcast.mjs [--dry-run] [--max-items N]
// Env:    EDGE_TTS_VOICE       (default en-US-ChristopherNeural)
//         BACKLOGCAST_MAX_CHARS  cap on narrated characters (testing only)

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import YAML from 'yaml';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const NOTES_DIR = path.join(ROOT, 'src/content/notes');
const ARTICLES_DIR = path.join(ROOT, 'src/content/articles');
const AUDIO_DIR = path.join(ROOT, 'public/media/audio');
const VOICE = process.env.EDGE_TTS_VOICE || 'en-US-ChristopherNeural';
const MAX_CHARS = Number(process.env.BACKLOGCAST_MAX_CHARS || 0);

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const MAX_ITEMS = args.includes('--max-items')
  ? Number(args[args.indexOf('--max-items') + 1])
  : Infinity;

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
      const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
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

async function extract(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BacklogCast/1.0)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const parsed = new Readability(dom.window.document).parse();
  if (!parsed || !parsed.textContent?.trim()) throw new Error('readability found no content');
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  td.remove(['script', 'style']);
  return {
    title: parsed.title?.trim(),
    markdown: td.turndown(parsed.content),
    text: parsed.textContent.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
  };
}

function tts(text, outFile) {
  let input = text;
  if (MAX_CHARS > 0 && input.length > MAX_CHARS) input = input.slice(0, MAX_CHARS);
  const tmp = path.join(AUDIO_DIR, '.tts-input.txt');
  fs.writeFileSync(tmp, input);
  const r = spawnSync(
    'edge-tts',
    ['--voice', VOICE, '--file', tmp, '--write-media', outFile],
    { stdio: ['ignore', 'inherit', 'inherit'], timeout: 30 * 60 * 1000 }
  );
  fs.rmSync(tmp, { force: true });
  if (r.status !== 0 || !fs.existsSync(outFile) || fs.statSync(outFile).size === 0) {
    fs.rmSync(outFile, { force: true });
    return false;
  }
  return true;
}

function writeArticle(slug, { url, title, date, tags, markdown, audio }) {
  const fm = {
    title: title || url,
    url,
    date: date.toISOString(),
    ...(audio ? { audio } : {}),
    status: 'ready',
    ...(tags.length ? { tags } : {}),
  };
  const out = `---\n${YAML.stringify(fm).trim()}\n---\n\n${markdown}\n`;
  fs.writeFileSync(path.join(ARTICLES_DIR, `${slug}.md`), out);
}

const queue = collectQueue();
console.log(`queue: ${queue.length} item(s)`);
fs.mkdirSync(ARTICLES_DIR, { recursive: true });
fs.mkdirSync(AUDIO_DIR, { recursive: true });

let done = 0;
for (const item of queue) {
  if (done >= MAX_ITEMS) break;
  const slug = articleSlug(item.title, item.url);
  console.log(`\n→ ${item.url}\n  slug: ${slug}`);
  if (DRY) continue;

  try {
    let title = item.title;
    let markdown = item.existing?.body?.trim();
    let text;

    if (!markdown) {
      const ex = await extract(item.url);
      title = ex.title || title;
      markdown = ex.markdown;
      text = ex.text;
    } else {
      title = item.existing.data.title;
      text = markdown.replace(/[#*_`>\[\]()!]/g, ' ').replace(/\s+/g, ' ');
    }

    const audioFile = path.join(AUDIO_DIR, `${slug}.mp3`);
    let audio;
    console.log(`  narrating ${text.length} chars with ${VOICE}…`);
    if (tts(`${title}. ${text}`, audioFile)) {
      audio = `/media/audio/${slug}.mp3`;
      console.log(`  audio: ${audio} (${Math.round(fs.statSync(audioFile).size / 1024)} KB)`);
    } else {
      console.warn('  TTS failed — article saved without audio, will retry next run');
    }

    writeArticle(slug, { url: item.url, title, date: item.date, tags: item.tags, markdown, audio });
    console.log(`  wrote src/content/articles/${slug}.md`);
    done += 1;
  } catch (err) {
    console.error(`  FAILED: ${err.message}`);
  }
}
console.log(`\nprocessed ${done} item(s)`);
