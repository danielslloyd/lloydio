// Cloudflare Pages Function: POST /api/reading
//
// Owner-only edits for the /reading page (the edit button in DRAFTS=1 builds).
//
//   { action: 'add', url, title?, podcast? }
//     Commits a note tagged `reading` (plus `podcast` when podcast is true,
//     which queues it for BacklogCast). The note skips process-inbox triage.
//     Duplicates (same URL ignoring tracking params/fragments) are rejected
//     using the static /api/reading-urls.json from the last deploy, so a link
//     added moments ago can slip through — harmless, BacklogCast dedupes too.
//
//   { action: 'listen', op, notePath, slug, articlePath?, audio? }
//     The LISTEN column. op:
//       queue    — tag the note `podcast` (BacklogCast picks it up)
//       unqueue  — drop the `podcast` tag (and tell BacklogCast via R2)
//       cancel   — drop the tag and mark status/<slug> `cancelled` in R2, which
//                  BacklogCast checks between chunks and stops on
//       delete   — remove the narration (R2 mp3 + the article's audio fields;
//                  the clean text stays) and untag, back to "+"
//
// Auth: as functions/api/books.js (Access JWT, falling back to CAPTURE_TOKEN).
// Env: GH_TOKEN / GH_REPO / GH_BRANCH to commit; the AUDIO R2 binding for
// cancel/delete (see functions/_episodes.js).

import {
  authorized,
  githubGetFile,
  githubPutFile,
  json,
  CORS,
} from '../_owner.js';
import { buildNote, archiveUrl, normalizeUrl, setNoteTag } from '../_note.js';
import { SLUG_RE, putStatus, clearStatus, audioKeyFromUrl } from '../_episodes.js';

const NOTE_PATH_RE = /^src\/content\/notes\/[A-Za-z0-9._-]+\.md$/;
const ARTICLE_PATH_RE = /^src\/content\/articles\/[a-z0-9-]+\.md$/;

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!(await authorized(request, env))) return json({ error: 'unauthorized' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  try {
    if (body.action === 'add') return await add(context, body);
    if (body.action === 'listen') return await listen(env, body);
  } catch (e) {
    return json({ error: e.message }, 502);
  }
  return json({ error: 'unknown action' }, 400);
}

async function add(context, body) {
  const { request, env } = context;
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!/^https?:\/\/[^\s]+$/.test(url)) return json({ error: 'url must be http(s)' }, 400);
  try {
    new URL(url);
  } catch {
    return json({ error: 'invalid url' }, 400);
  }
  const title = typeof body.title === 'string' ? body.title.trim().replace(/\s+/g, ' ').slice(0, 300) : '';

  const dupe = await findDuplicate(env, request.url, url);
  if (dupe) return json({ result: 'duplicate', title: dupe.title, status: dupe.status });

  const { path, text } = buildNote({
    url,
    title: title || undefined,
    tags: body.podcast === true ? ['reading', 'podcast'] : ['reading'],
    inbox: false,
    source: 'reading',
  });
  await githubPutFile(env, path, text, undefined, `capture: ${title || url}`);
  archiveUrl(context, url);
  return json({ result: 'queued', path, listen: body.podcast === true ? 'queued' : 'none' });
}

async function listen(env, body) {
  const { op, notePath, slug, articlePath, audio } = body;
  if (notePath && !NOTE_PATH_RE.test(notePath)) return json({ error: 'invalid notePath' }, 400);
  if (slug && !SLUG_RE.test(slug)) return json({ error: 'invalid slug' }, 400);
  const needsR2 = op === 'cancel' || op === 'delete';
  if (needsR2 && !env.AUDIO) {
    return json({ error: 'AUDIO R2 binding is not configured on this Pages project' }, 500);
  }

  if (op === 'queue' || op === 'unqueue' || op === 'cancel') {
    if (!notePath) return json({ error: 'this item has no reading note to tag' }, 400);
    await tagNote(env, notePath, op === 'queue', op);
    if (env.AUDIO && slug) {
      // `queue` clears a stale `cancelled`. `unqueue`/`cancel` tell BacklogCast
      // right away (it checks R2 before and during narration), so a queue
      // listing that hasn't rebuilt yet can't start or keep narrating it.
      if (op === 'queue') await clearStatus(env, slug);
      else await putStatus(env, slug, 'cancelled');
    }
    return json({ ok: true, listen: op === 'queue' ? 'queued' : 'none' });
  }

  if (op === 'delete') {
    // Removes the narration only: the R2 mp3 and the article's audio fields.
    // The clean text (the "md" link) stays.
    if (!articlePath || !ARTICLE_PATH_RE.test(articlePath)) return json({ error: 'invalid articlePath' }, 400);
    const key = audioKeyFromUrl(env, audio);
    if (key) await env.AUDIO.delete(key);
    const { text, sha } = await githubGetFile(env, articlePath);
    await githubPutFile(env, articlePath, stripAudio(text), sha,
      `backlogcast: delete episode ${articlePath.split('/').pop()}`);
    if (notePath) await tagNote(env, notePath, false, 'delete');
    return json({ ok: true, listen: 'none', audioDeleted: Boolean(key) });
  }

  return json({ error: 'unknown op' }, 400);
}

// Drops audio/audio_bytes/duration from an article's frontmatter.
function stripAudio(text) {
  return text.replace(/^(---\r?\n[\s\S]*?\r?\n---)/, (fm) =>
    fm.replace(/^(audio|audio_bytes|duration):.*\r?\n/gm, ''));
}

// Toggles `podcast`; always keeps `reading` so the link stays on the list.
async function tagNote(env, notePath, on, op) {
  const { text, sha } = await githubGetFile(env, notePath);
  const next = setNoteTag(setNoteTag(text, 'reading', true), 'podcast', on);
  if (next !== text) {
    await githubPutFile(env, notePath, next, sha, `reading: ${op} ${notePath.split('/').pop()}`);
  }
}

async function findDuplicate(env, requestUrl, url) {
  try {
    // Read the static asset directly: a plain same-origin fetch on the owner
    // site would bounce off the Access gate (no cookie on subrequests).
    const assetUrl = new URL('/api/reading-urls.json', requestUrl);
    const res = env.ASSETS ? await env.ASSETS.fetch(assetUrl) : await fetch(assetUrl);
    if (!res.ok) return null;
    const { urls = [] } = await res.json();
    const want = normalizeUrl(url);
    return urls.find((u) => normalizeUrl(u.url) === want) || null;
  } catch {
    return null; // never block an add on the duplicate check
  }
}
