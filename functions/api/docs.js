// Cloudflare Pages Function: POST /api/docs
//
// Owner-only endpoint for saving a curated category doc (src/content/docs/
// <slug>.md) from the in-page editor on /commonplace, /quotes, etc. The
// request carries the edited markdown *body*; the frontmatter block (title/
// blurb) is read from the current file and preserved, so the editor can't
// corrupt the schema. Committing triggers a rebuild.
//
// Auth + GitHub plumbing live in functions/_owner.js (same Access-JWT scheme
// as /api/books). See that file for the required environment variables.

import { CORS, json, authorized, githubGetFile, githubPutFile } from '../_owner.js';

// Only these slugs may be written (they map to existing docs). The strict
// pattern also blocks any path traversal in the file path we build.
const ALLOWED = new Set(['commonplace', 'quotes', 'beautiful', 'infographics']);

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!(await authorized(request, env))) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  if (!ALLOWED.has(slug) || !/^[a-z0-9-]+$/.test(slug)) {
    return json({ error: 'unknown doc slug' }, 400);
  }
  if (typeof body.body !== 'string') {
    return json({ error: 'missing body' }, 400);
  }

  const file = `src/content/docs/${slug}.md`;

  let current;
  try {
    current = await githubGetFile(env, file);
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }

  // Preserve the frontmatter block verbatim; replace only the markdown body.
  const fm = current.text.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)/);
  const frontmatter = fm ? fm[1].replace(/\r\n/g, '\n') : '';
  const newBody = body.body.replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';
  const next = (frontmatter ? frontmatter + '\n' : '') + newBody;

  if (next === current.text) {
    return json({ ok: true, note: 'no change' });
  }

  try {
    await githubPutFile(env, file, next, current.sha, `docs: edit ${slug}`);
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }

  return json({ ok: true, slug });
}
