// Shared R2 helpers for BacklogCast episodes (files prefixed with `_` are not
// routed by Cloudflare Pages).
//
// Live listen state lives in the AUDIO bucket as small JSON objects at
// `status/<slug>.json` — { state, updated } where state is `in_progress`
// (BacklogCast picked it up), `failed`, `cancelled` (the owner cancelled;
// BacklogCast stops and clears it), or `removed` (the owner took the link off
// the reading list: BacklogCast drops the job and /api/episode refuses it;
// re-adding the link clears it). No object = nothing in flight. Kept out of
// git so progress updates don't trigger site rebuilds.
//
// Clean-text progress is tracked the same way, separately, at
// `textstatus/<slug>.json` — { state, reason?, updated } with state
// `in_progress` (extracting), `waiting` (failed; BacklogCast retries later) or
// `failed` (gave up). It lets /reading tell a missing "md" link that's still
// coming from one that won't. Not sensitive (slugs are in the public queue),
// so the public page reads it too.
//
// Requires the AUDIO R2 binding on whichever Pages project serves the call —
// the public site (BacklogCast's writes) and the owner site (the /reading
// editor) both need it.

export const STATES = new Set(['in_progress', 'failed', 'cancelled', 'removed']);
export const TEXT_STATES = new Set(['in_progress', 'waiting', 'failed']);
export const SLUG_RE = /^[a-z0-9-]{1,120}$/;

const statusKey = (slug) => `status/${slug}.json`;
const textKey = (slug) => `textstatus/${slug}.json`;

export async function putStatus(env, slug, state) {
  await env.AUDIO.put(statusKey(slug), JSON.stringify({ state, updated: new Date().toISOString() }), {
    httpMetadata: { contentType: 'application/json' },
  });
}

export async function clearStatus(env, slug) {
  await env.AUDIO.delete(statusKey(slug));
}

export async function getStatus(env, slug) {
  const obj = await env.AUDIO.get(statusKey(slug));
  return obj ? obj.json() : null;
}

export async function putTextStatus(env, slug, state, reason) {
  const body = { state, updated: new Date().toISOString() };
  if (reason) body.reason = String(reason).slice(0, 300);
  await env.AUDIO.put(textKey(slug), JSON.stringify(body), {
    httpMetadata: { contentType: 'application/json' },
  });
}

export async function clearTextStatus(env, slug) {
  await env.AUDIO.delete(textKey(slug));
}

// { slug: { state, updated } } for everything in flight.
export function listStatuses(env) {
  return listPrefix(env, 'status/');
}

// { slug: { state, reason?, updated } } for text extraction.
export function listTextStatuses(env) {
  return listPrefix(env, 'textstatus/');
}

async function listPrefix(env, prefix) {
  const out = {};
  let cursor;
  do {
    const page = await env.AUDIO.list({ prefix, cursor });
    await Promise.all(
      page.objects.map(async (o) => {
        const slug = o.key.slice(prefix.length).replace(/\.json$/, '');
        const obj = await env.AUDIO.get(o.key);
        if (obj) out[slug] = await obj.json();
      })
    );
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

// Deterministic slug for a reading-list link. Keep in sync with articleSlug()
// in src/lib/reading.ts and pipeline/backlogcast.mjs.
export function articleSlug(title, url) {
  const base =
    (title || new URL(url).hostname + new URL(url).pathname)
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

export function audioBase(env) {
  return (env.AUDIO_BASE_URL || 'https://media.lloyd.studio').replace(/\/+$/, '');
}

// The R2 key for an episode's public audio URL, or null if it isn't one of ours.
export function audioKeyFromUrl(env, url) {
  const prefix = `${audioBase(env)}/`;
  if (typeof url !== 'string' || !url.startsWith(prefix)) return null;
  const key = url.slice(prefix.length);
  return /^episodes\/[a-z0-9-]+\.mp3$/.test(key) ? key : null;
}
