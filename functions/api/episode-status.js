// Cloudflare Pages Function: /api/episode-status
//
// Live listen state for the /reading LISTEN column (see functions/_episodes.js).
//   GET                 → { statuses: { slug: { state, updated } } }
//   GET ?slug=<slug>    → { slug, state|null }   (BacklogCast's cancel check)
//   POST { slug, state } → state ∈ in_progress | failed | cancelled, or `clear`
//
// BacklogCast reports progress here with `Bearer EPISODE_TOKEN`; the owner page
// reads it with its Access cookie (owner auth via _owner.js `authorized`).

import { authorized, json, CORS } from '../_owner.js';
import { STATES, SLUG_RE, putStatus, clearStatus, getStatus, listStatuses } from '../_episodes.js';

export async function onRequestOptions() {
  return new Response(null, { headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
}

async function allowed(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (env.EPISODE_TOKEN && auth === `Bearer ${env.EPISODE_TOKEN}`) return true;
  return authorized(request, env);
}

export async function onRequestGet({ request, env }) {
  if (!(await allowed(request, env))) return json({ error: 'unauthorized' }, 401);
  if (!env.AUDIO) return json({ error: 'AUDIO R2 binding is not configured' }, 500);
  const slug = new URL(request.url).searchParams.get('slug');
  if (slug) {
    if (!SLUG_RE.test(slug)) return json({ error: 'invalid slug' }, 400);
    const s = await getStatus(env, slug);
    return json({ slug, state: s?.state ?? null, updated: s?.updated ?? null });
  }
  return json({ statuses: await listStatuses(env) });
}

export async function onRequestPost({ request, env }) {
  if (!(await allowed(request, env))) return json({ error: 'unauthorized' }, 401);
  if (!env.AUDIO) return json({ error: 'AUDIO R2 binding is not configured' }, 500);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const { slug, state } = body || {};
  if (!SLUG_RE.test(slug || '')) return json({ error: 'invalid slug' }, 400);
  if (state === 'clear') await clearStatus(env, slug);
  else if (STATES.has(state)) await putStatus(env, slug, state);
  else return json({ error: 'invalid state' }, 400);
  return json({ ok: true, slug, state });
}
