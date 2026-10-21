// Cloudflare Pages Function: POST /api/episode
//
// Write-back endpoint for the local BacklogCast app (see docs/BACKLOGCAST.md).
// BacklogCast extracts every reading-list link into clean text, narrates the
// ones queued for listening with Henty, and POSTs results here as
// multipart/form-data:
//
//   slug              item key (from /api/podcast-queue.json)
//   title, url, date  article metadata (date = ISO publish time)
//   markdown          the clean article text
//   author, source, published  byline facts, where known (published =
//                     the piece's own date, YYYY[-MM[-DD]]) — all optional
//   audio             the mp3 file            — narration only
//   duration_seconds  episode length          — narration only
//
// Text only: commits src/content/articles/<slug>.md with the clean text, so
// /reading gets its "md" link. With audio: also stores the mp3 in R2 (served
// at AUDIO_BASE_URL) and adds audio/audio_bytes/duration, which puts it in
// /podcast/<FEED_TOKEN>.xml. The commit triggers a rebuild. Re-POSTing a slug
// overwrites (idempotent); a text-only POST keeps any audio already recorded.
//
// Environment (the public Pages project — BacklogCast posts to lloyd.studio):
//   AUDIO          — R2 bucket binding for episode mp3s
//   AUDIO_BASE_URL — public base of that bucket (default https://media.lloyd.studio)
//   EPISODE_TOKEN  — shared secret BacklogCast sends as `Bearer <token>`
//   GH_TOKEN, GH_REPO, GH_BRANCH — as for /api/capture
// Access JWT / CAPTURE_TOKEN (via _owner.js `authorized`) are accepted too.

import { authorized, githubGetFile, githubPutFile, json, CORS } from '../_owner.js';
import { audioBase, clearStatus, clearTextStatus, getStatus } from '../_episodes.js';

const SLUG_RE = /^[a-z0-9-]{1,120}$/;
const AUDIO_KEYS = ['audio', 'audio_bytes', 'duration'];

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = request.headers.get('Authorization') || '';
  const viaToken = env.EPISODE_TOKEN && auth === `Bearer ${env.EPISODE_TOKEN}`;
  if (!viaToken && !(await authorized(request, env))) {
    return json({ error: 'unauthorized' }, 401);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'expected multipart/form-data' }, 400);
  }

  const slug = String(form.get('slug') || '');
  const title = String(form.get('title') || '').trim();
  const url = String(form.get('url') || '').trim();
  const markdown = String(form.get('markdown') || '');
  const audio = form.get('audio');
  const hasAudio = audio && typeof audio !== 'string' && audio.size > 0;
  const duration = Math.max(0, Math.round(Number(form.get('duration_seconds')) || 0));
  // Optional byline facts; blank ones are left out of the frontmatter.
  const byline = ['author', 'source', 'published']
    .map((k) => [k, String(form.get(k) || '').trim().slice(0, 200)])
    .filter(([k, v]) => v && (k !== 'published' || /^\d{4}(-\d{2}){0,2}$/.test(v)))
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  const dateIn = String(form.get('date') || '');
  const date = isNaN(Date.parse(dateIn)) ? new Date() : new Date(dateIn);

  if (!SLUG_RE.test(slug)) return json({ error: 'invalid slug' }, 400);
  if (!/^https?:\/\//.test(url)) return json({ error: 'url must be http(s)' }, 400);
  if (!title) return json({ error: 'title is required' }, 400);
  if (!hasAudio && !markdown.trim()) return json({ error: 'markdown or audio is required' }, 400);

  // Taken off the reading list by the owner: don't bring it back.
  if (env.AUDIO && (await getStatus(env, slug).catch(() => null))?.state === 'removed') {
    return json({ error: 'removed from the reading list', removed: true }, 410);
  }

  const path = `src/content/articles/${slug}.md`;
  let existing;
  try {
    existing = await githubGetFile(env, path);
  } catch (e) {
    if (!String(e.message).includes('404')) return json({ error: e.message }, 502);
  }

  let audioLines = [];
  let audioUrl = null;
  if (hasAudio) {
    if (!env.AUDIO) return json({ error: 'AUDIO R2 binding is not configured' }, 500);
    const key = `episodes/${slug}.mp3`;
    // Buffer first: a chunked upload gives a stream of unknown length, which
    // R2 put() rejects. Episodes are tens of MB at most, well within limits.
    await env.AUDIO.put(key, await audio.arrayBuffer(), {
      httpMetadata: { contentType: audio.type || 'audio/mpeg' },
    });
    audioUrl = `${audioBase(env)}/${key}`;
    audioLines = [`audio: ${JSON.stringify(audioUrl)}`, `audio_bytes: ${audio.size}`, `duration: ${duration}`];
  } else if (existing) {
    // Text refresh: keep whatever narration the article already has.
    audioLines = frontmatterLines(existing.text).filter((l) => AUDIO_KEYS.some((k) => l.startsWith(`${k}:`)));
  }

  const text = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `url: ${JSON.stringify(url)}`,
    ...byline,
    `date: ${date.toISOString()}`,
    'status: ready',
    ...audioLines,
    '---',
    '',
    markdown.trim(),
    '',
  ].join('\n');

  try {
    await githubPutFile(env, path, text, existing?.sha, `backlogcast: ${hasAudio ? '' : 'text: '}${title}`);
  } catch (e) {
    return json({ error: e.message }, 502);
  }

  // Narration landed: drop the live in-progress marker (see _episodes.js).
  if (hasAudio && env.AUDIO) await clearStatus(env, slug).catch(() => {});
  // The text exists now, whatever extraction reported before.
  if (env.AUDIO) await clearTextStatus(env, slug).catch(() => {});
  return json({
    ok: true,
    slug,
    audio_url: audioUrl,
    audio_bytes: hasAudio ? audio.size : null,
    article_path: path,
  });
}

function frontmatterLines(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1].split(/\r?\n/) : [];
}
