// Cloudflare Pages Function: POST /api/books
//
// Owner-only endpoint for acting on draft books in src/content/books.yaml.
// Used by the owner-mode ("DRAFTS=1") Drafts section on /books: it can
// publish a draft (drop `draft: true`, optionally set status/rating) or
// delete a draft outright, committing the change to GitHub — which triggers
// a rebuild. Edits are line-scoped so the diff stays minimal and the rest of
// the hand-authored file is preserved verbatim.
//
// Auth + environment mirror functions/api/capture.js:
//   CAPTURE_TOKEN — shared owner secret (sent as `Bearer <token>`)
//   GH_TOKEN      — fine-grained GitHub PAT with contents:write on this repo
//   GH_REPO       — e.g. "danielslloyd/lloydio"
//   GH_BRANCH     — e.g. "main"

const FILE = 'src/content/books.yaml';
const STATUSES = new Set(['to-read', 'reading', 'finished']);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = request.headers.get('Authorization') || '';
  if (!env.CAPTURE_TOKEN || auth !== `Bearer ${env.CAPTURE_TOKEN}`) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }

  // Accept a single op ({ action, id, ... }) or a batch ({ ops: [...] }).
  const ops = Array.isArray(body.ops) ? body.ops : [body];
  const clean = [];
  for (const op of ops) {
    const id = typeof op.id === 'string' ? op.id.trim() : '';
    const action = op.action === 'delete' ? 'delete' : 'publish';
    if (!id) return json({ error: 'missing id' }, 400);
    const status = STATUSES.has(op.status) ? op.status : undefined;
    const rating =
      Number.isInteger(op.rating) && op.rating >= 0 && op.rating <= 5 ? op.rating : undefined;
    clean.push({ id, action, status, rating });
  }
  if (!clean.length) return json({ error: 'no ops' }, 400);

  const repo = env.GH_REPO;
  const branch = env.GH_BRANCH || 'main';
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${FILE}?ref=${branch}`;
  const ghHeaders = {
    Authorization: `Bearer ${env.GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'lloydio-books',
  };

  // Fetch current file + sha.
  const getRes = await fetch(apiUrl, { headers: ghHeaders });
  if (!getRes.ok) {
    return json({ error: `github get ${getRes.status}` }, 502);
  }
  const meta = await getRes.json();
  const original = fromBase64(meta.content);

  let text = original;
  const applied = [];
  const missing = [];
  for (const op of clean) {
    const next = applyOp(text, op);
    if (next === null) {
      missing.push(op.id);
    } else {
      text = next;
      applied.push(op.id);
    }
  }

  if (missing.length) return json({ error: 'id not found', missing }, 404);
  if (text === original) return json({ ok: true, applied: [], note: 'no change' });

  const message =
    clean.length === 1
      ? `books: ${clean[0].action} ${clean[0].id}`
      : `books: ${clean[0].action} ${clean.length} drafts`;

  const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${FILE}`, {
    method: 'PUT',
    headers: { ...ghHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: toBase64(text), sha: meta.sha, branch }),
  });
  if (!putRes.ok) {
    const detail = await putRes.text();
    return json({ error: `github put ${putRes.status}`, detail: detail.slice(0, 300) }, 502);
  }

  return json({ ok: true, applied });
}

// Apply one op to the YAML text via line-scoped edits. Returns the new text,
// or null if the id was not found.
function applyOp(text, op) {
  const lines = text.split('\n');
  // Entry boundaries: a top-level list item begins with "- " at column 0.
  const starts = [];
  for (let i = 0; i < lines.length; i++) if (/^- /.test(lines[i])) starts.push(i);

  let target = -1;
  for (let s = 0; s < starts.length; s++) {
    const i = starts[s];
    const m = lines[i].match(/^- id:\s*"?([^"\s]+)"?\s*$/);
    if (m && m[1] === op.id) {
      target = s;
      break;
    }
  }
  if (target === -1) return null;

  const from = starts[target];
  const to = target + 1 < starts.length ? starts[target + 1] : lines.length;
  let block = lines.slice(from, to);

  if (op.action === 'delete') {
    const out = [...lines.slice(0, from), ...lines.slice(to)];
    return out.join('\n');
  }

  // publish: drop `draft: true`, optionally set status / rating.
  block = block.filter((l) => !/^\s*draft:\s*true\s*$/.test(l));

  if (op.status) {
    const si = block.findIndex((l) => /^\s*status:/.test(l));
    if (si !== -1) block[si] = block[si].replace(/status:.*/, `status: ${op.status}`);
  }

  if (op.rating !== undefined) {
    const ri = block.findIndex((l) => /^\s*rating:/.test(l));
    if (ri !== -1) {
      block[ri] = block[ri].replace(/rating:.*/, `rating: ${op.rating}`);
    } else {
      // Insert after the status line (matching the file's field order).
      const si = block.findIndex((l) => /^\s*status:/.test(l));
      const at = si !== -1 ? si + 1 : 1;
      block.splice(at, 0, `  rating: ${op.rating}`);
    }
  }

  const out = [...lines.slice(0, from), ...block, ...lines.slice(to)];
  return out.join('\n');
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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
