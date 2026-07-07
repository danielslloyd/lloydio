// Cloudflare Pages Function: POST /api/capture
//
// Accepts a link/note, commits it as a markdown file to the GitHub repo
// (which triggers a site rebuild), and asks the Internet Archive to
// snapshot the URL.
//
// Required environment variables (set in the Cloudflare Pages dashboard):
//   CAPTURE_TOKEN — a long random secret; the PWA/extension sends it
//   GH_TOKEN      — fine-grained GitHub PAT with contents:write on this repo
//   GH_REPO       — e.g. "danielslloyd/lloydio"
//   GH_BRANCH     — e.g. "main"

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

  const url = typeof body.url === 'string' && body.url.startsWith('http') ? body.url : undefined;
  const title = clean(body.title);
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const tags = Array.isArray(body.tags) ? body.tags.map(clean).filter(Boolean).slice(0, 10) : [];
  const draft = body.draft === true;

  if (!url && !title && !note) return json({ error: 'empty capture' }, 400);

  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, ''); // 20260707T190755
  const slugBase = (title || (url ? new URL(url).hostname : 'note'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'note';
  const path = `src/content/notes/${now.toISOString().slice(0, 10)}-${stamp.slice(9)}-${slugBase}.md`;

  const fm = [
    '---',
    title ? `title: ${JSON.stringify(title)}` : null,
    url ? `url: ${JSON.stringify(url)}` : null,
    url ? `archive: ${JSON.stringify('https://web.archive.org/web/2/' + url)}` : null,
    `date: ${now.toISOString()}`,
    tags.length ? `tags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]` : null,
    draft ? 'draft: true' : null,
    '---',
    '',
    note,
    '',
  ]
    .filter((l) => l !== null)
    .join('\n');

  // Commit via the GitHub Contents API.
  const ghRes = await fetch(
    `https://api.github.com/repos/${env.GH_REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'lloydio-capture',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `capture: ${title || url || 'note'}`,
        content: toBase64(fm),
        branch: env.GH_BRANCH || 'main',
      }),
    }
  );

  if (!ghRes.ok) {
    const detail = await ghRes.text();
    return json({ error: `github ${ghRes.status}`, detail: detail.slice(0, 300) }, 502);
  }

  // Fire-and-forget: ask the Wayback Machine to snapshot the link.
  if (url) {
    context.waitUntil(
      fetch(`https://web.archive.org/save/${url}`, {
        headers: { 'User-Agent': 'lloydio-capture' },
        redirect: 'manual',
      }).catch(() => {})
    );
  }

  return json({ ok: true, path });
}

function clean(s) {
  return typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').slice(0, 300) : undefined;
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
