// Cloudflare Pages Function: POST /api/episode
//
// Write-back endpoint for the local BacklogCast app (see docs/BACKLOGCAST.md).
// BacklogCast extracts a queued link, narrates it with Henty, then POSTs the
// finished episode here as multipart/form-data:
//
//   slug              lloydio's article slug (from /api/podcast-queue.json)
//   title, url, date  article metadata (date = ISO episode publish time)
//   duration_seconds  episode length
//   markdown          the clean article text
//   audio             the mp3 file
//
// We store the mp3 in R2 (served publicly at AUDIO_BASE_URL) and commit
// src/content/articles/<slug>.md with `status: ready` + the audio URL. The
// commit triggers a rebuild, which takes the item off the queue and adds it to
// /podcast/<FEED_TOKEN>.xml. Re-POSTing a slug overwrites both (idempotent).
//
// Environment (the public Pages project — BacklogCast posts to lloyd.studio):
//   AUDIO          — R2 bucket binding for episode mp3s
//   AUDIO_BASE_URL — public base of that bucket (default https://media.lloyd.studio)
//   EPISODE_TOKEN  — shared secret BacklogCast sends as `Bearer <token>`
//   GH_TOKEN, GH_REPO, GH_BRANCH — as for /api/capture
// Access JWT / CAPTURE_TOKEN (via _owner.js `authorized`) are accepted too.

import { authorized, githubGetFile, githubPutFile, json, CORS } from '../_owner.js';

const SLUG_RE = /^[a-z0-9-]{1,120}$/;

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
  if (!env.AUDIO) return json({ error: 'AUDIO R2 binding is not configured' }, 500);

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
  const duration = Math.max(0, Math.round(Number(form.get('duration_seconds')) || 0));
  const dateIn = String(form.get('date') || '');
  const date = isNaN(Date.parse(dateIn)) ? new Date() : new Date(dateIn);

  if (!SLUG_RE.test(slug)) return json({ error: 'invalid slug' }, 400);
  if (!/^https?:\/\//.test(url)) return json({ error: 'url must be http(s)' }, 400);
  if (!title) return json({ error: 'title is required' }, 400);
  if (!audio || typeof audio === 'string' || !audio.size) {
    return json({ error: 'audio file is required' }, 400);
  }

  const key = `episodes/${slug}.mp3`;
  await env.AUDIO.put(key, audio.stream(), {
    httpMetadata: { contentType: audio.type || 'audio/mpeg' },
  });
  const base = (env.AUDIO_BASE_URL || 'https://media.lloyd.studio').replace(/\/+$/, '');
  const audioUrl = `${base}/${key}`;

  const path = `src/content/articles/${slug}.md`;
  const text = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `url: ${JSON.stringify(url)}`,
    `date: ${date.toISOString()}`,
    'status: ready',
    `audio: ${JSON.stringify(audioUrl)}`,
    `audio_bytes: ${audio.size}`,
    `duration: ${duration}`,
    '---',
    '',
    markdown.trim(),
    '',
  ].join('\n');

  let sha;
  try {
    sha = (await githubGetFile(env, path)).sha;
  } catch (e) {
    if (!String(e.message).includes('404')) return json({ error: e.message }, 502);
  }
  try {
    await githubPutFile(env, path, text, sha, `backlogcast: ${title}`);
  } catch (e) {
    return json({ error: e.message }, 502);
  }

  return json({ ok: true, slug, audio_url: audioUrl, audio_bytes: audio.size, article_path: path });
}
