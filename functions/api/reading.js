// Cloudflare Pages Function: POST /api/reading
//
// Owner-only "add URL" for the /reading page (the edit button in DRAFTS=1
// builds). `{ action: 'add', url, title? }` commits a note tagged `podcast`
// to src/content/notes/, which queues it for BacklogCast (see
// docs/BACKLOGCAST.md). The note skips the process-inbox triage (`inbox`
// unset) since its only job is to be narrated.
//
// Duplicates (same URL ignoring tracking params/fragments) are rejected using
// the static /api/reading-urls.json from the last deploy, so a link added
// moments ago and not yet rebuilt can slip through — harmless, BacklogCast
// dedupes by URL too.
//
// Auth and environment: as functions/api/books.js (Access JWT, falling back to
// CAPTURE_TOKEN; GH_TOKEN / GH_REPO / GH_BRANCH to commit).

import { authorized, githubPutFile, json, CORS } from '../_owner.js';
import { buildNote, archiveUrl, normalizeUrl } from '../_note.js';

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
  if (body.action !== 'add') return json({ error: 'unknown action' }, 400);

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
    tags: ['podcast'],
    inbox: false,
    source: 'reading',
  });
  try {
    await githubPutFile(env, path, text, undefined, `capture: ${title || url}`);
  } catch (e) {
    return json({ error: e.message }, 502);
  }
  archiveUrl(context, url);
  return json({ result: 'queued', path });
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
