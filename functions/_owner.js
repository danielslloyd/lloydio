// Shared helpers for owner-only Pages Functions (files prefixed with `_` are
// not routed by Cloudflare Pages; they exist only to be imported).
//
// Auth mirrors functions/api/books.js: the owner-mode deployment sits behind
// Cloudflare Zero Trust Access, so a request already carries a signed Access
// JWT — that is the authentication. We verify it (issuer/expiry/audience/
// signature) and fall back to the shared bearer token off the Access host.
//
// Environment (owner-mode Pages project):
//   CF_ACCESS_TEAM_DOMAIN — e.g. "myteam.cloudflareaccess.com" (enables JWT auth)
//   CF_ACCESS_AUD         — the Access application AUD tag (recommended)
//   GH_TOKEN              — fine-grained GitHub PAT with contents:write on this repo
//   GH_REPO               — e.g. "danielslloyd/lloydio"
//   GH_BRANCH             — e.g. "main"
//   CAPTURE_TOKEN         — optional shared secret fallback (`Bearer <token>`)

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ---- Authorization ------------------------------------------------------
export async function authorized(request, env) {
  if (await verifyAccessJwt(request, env)) return true;
  const auth = request.headers.get('Authorization') || '';
  if (env.CAPTURE_TOKEN && auth === `Bearer ${env.CAPTURE_TOKEN}`) return true;
  return false;
}

async function verifyAccessJwt(request, env) {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
  if (!teamDomain) return false; // JWT auth not configured
  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') || getCookie(request, 'CF_Authorization');
  if (!token) return false;
  try {
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return false;
    const header = JSON.parse(b64urlToStr(h));
    if (header.alg !== 'RS256') return false;
    const payload = JSON.parse(b64urlToStr(p));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now >= payload.exp) return false;
    if (payload.nbf && now < payload.nbf) return false;
    const issuer = `https://${teamDomain}`;
    if (payload.iss && payload.iss !== issuer) return false;
    if (env.CF_ACCESS_AUD) {
      const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!auds.includes(env.CF_ACCESS_AUD)) return false;
    }
    const certs = await fetch(`${issuer}/cdn-cgi/access/certs`).then((r) => r.json());
    const jwk = (certs.keys || []).find((k) => k.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const data = new TextEncoder().encode(`${h}.${p}`);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(s), data);
  } catch {
    return false;
  }
}

function getCookie(request, name) {
  const c = request.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

// ---- GitHub contents API ------------------------------------------------
function ghHeaders(env) {
  return {
    Authorization: `Bearer ${env.GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'lloydio-owner',
  };
}

// Returns { text, sha } for a repo file, or throws with a descriptive message.
export async function githubGetFile(env, file) {
  const repo = env.GH_REPO;
  const branch = env.GH_BRANCH || 'main';
  const url = `https://api.github.com/repos/${repo}/contents/${file}?ref=${branch}`;
  const res = await fetch(url, { headers: ghHeaders(env) });
  if (!res.ok) throw new Error(`github get ${res.status}`);
  const meta = await res.json();
  return { text: fromBase64(meta.content), sha: meta.sha };
}

// Commits new content for a repo file. Returns the parsed GitHub response.
export async function githubPutFile(env, file, text, sha, message) {
  const repo = env.GH_REPO;
  const branch = env.GH_BRANCH || 'main';
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${file}`, {
    method: 'PUT',
    headers: { ...ghHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: toBase64(text), sha, branch }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`github put ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}

// ---- base64 / base64url -------------------------------------------------
function b64urlToBytes(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  if (s.length % 4) s += '='.repeat(4 - (s.length % 4));
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlToStr(str) {
  return new TextDecoder().decode(b64urlToBytes(str));
}

function fromBase64(b64) {
  const bin = atob((b64 || '').replace(/\n/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
