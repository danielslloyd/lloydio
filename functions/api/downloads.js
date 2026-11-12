// Owner-only: per-episode download counts for the /feed owner view.
//
// Episodes are served straight from the R2 custom domain (AUDIO_BASE_URL), so
// the repo has no download data. Cloudflare's GraphQL analytics (zone-level
// httpRequestsAdaptiveGroups) does: we group successful (200/206) mp3 GETs by
// (path, client IP, UTC day) and count distinct tuples, i.e. one download per
// IP per episode per day — podcast apps' range requests and retries collapse.
//
// Adaptive analytics only keeps a short window (plan-dependent), so each call
// re-reads the last DL_DAYS_BACK UTC days (default 3) and merges them into a
// tally stored in the AUDIO bucket (`stats/downloads.json`, per-day per-slug).
// Counts therefore start from the first call; hit this endpoint at least once
// per window (just opening /feed in owner mode does) to keep it gap-free.
//
// Env (owner-mode Pages project): CF_API_TOKEN (Analytics:Read on the zone),
// CF_ZONE_ID, AUDIO (R2 binding, for the tally); optional DL_DAYS_BACK.
// GET → { counts: { <slug>: n }, since: 'YYYY-MM-DD', ... }

import { json, authorized, CORS } from '../_owner.js';
import { audioBase } from '../_episodes.js';

const TALLY_KEY = 'stats/downloads.json';

export async function onRequestOptions() {
  return new Response(null, { headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
}

const QUERY = `query($zone: String!, $start: Time!, $end: Time!, $host: String!) {
  viewer { zones(filter: { zoneTag: $zone }) {
    httpRequestsAdaptiveGroups(limit: 10000, filter: {
      datetime_geq: $start, datetime_lt: $end,
      clientRequestHTTPHost: $host,
      clientRequestPath_like: "/episodes/%.mp3",
      requestSource: "eyeball",
      edgeResponseStatus_in: [200, 206]
    }) { dimensions { clientRequestPath clientIP } }
  } }
}`;

// Distinct (path, ip) pairs for one UTC day → { slug: downloads }.
async function dayCounts(env, host, day) {
  const start = `${day}T00:00:00Z`;
  const end = new Date(Date.parse(start) + 864e5).toISOString().replace(/\.\d+Z$/, 'Z');
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { zone: env.CF_ZONE_ID, start, end, host } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors?.length) {
    throw new Error(data.errors?.[0]?.message || `analytics ${res.status}`);
  }
  const rows = data.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? [];
  const seen = new Set();
  const out = {};
  for (const { dimensions: d } of rows) {
    const slug = d.clientRequestPath.replace(/^\/episodes\//, '').replace(/\.mp3$/, '');
    const k = `${slug}\n${d.clientIP}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out[slug] = (out[slug] || 0) + 1;
  }
  return out;
}

export async function onRequestGet({ request, env }) {
  if (!(await authorized(request, env))) return json({ error: 'unauthorized' }, 401);
  if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) {
    return json({ error: 'CF_API_TOKEN / CF_ZONE_ID are not configured on this Pages project' }, 500);
  }
  const host = new URL(audioBase(env)).host;
  const back = Math.min(30, Math.max(1, Number(env.DL_DAYS_BACK) || 3));

  let tally = { days: {} };
  if (env.AUDIO) {
    const obj = await env.AUDIO.get(TALLY_KEY).catch(() => null);
    if (obj) tally = await obj.json().catch(() => tally);
    tally.days ||= {};
  }

  const errors = [];
  const days = Array.from({ length: back }, (_, i) =>
    new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
  await Promise.all(days.map(async (day) => {
    try {
      tally.days[day] = await dayCounts(env, host, day);
    } catch (e) {
      errors.push(`${day}: ${e.message}`);
    }
  }));

  if (env.AUDIO && errors.length < days.length) {
    await env.AUDIO.put(TALLY_KEY, JSON.stringify(tally), {
      httpMetadata: { contentType: 'application/json' },
    }).catch(() => {});
  }

  const counts = {};
  for (const perDay of Object.values(tally.days)) {
    for (const [slug, n] of Object.entries(perDay)) counts[slug] = (counts[slug] || 0) + n;
  }
  const since = Object.keys(tally.days).sort()[0] ?? null;
  if (errors.length === days.length) return json({ error: errors[0], counts, since }, 502);
  return json({ counts, since, ...(errors.length ? { errors } : {}) });
}
