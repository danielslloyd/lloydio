// Shared note builder for Pages Functions that commit to src/content/notes/
// (files prefixed with `_` are not routed by Cloudflare Pages).
// Used by /api/capture (phone/extension captures) and /api/reading (owner-mode
// "add URL" on /reading).

// Builds the repo path + markdown for one note. `inbox: true` puts it in the
// process-inbox triage queue; podcast-only adds from /reading skip that.
export function buildNote({
  url,
  title,
  note = '',
  tags = [],
  draft = false,
  inbox = true,
  source = 'capture',
  now = new Date(),
}) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, ''); // 20260707T190755
  const slugBase = (title || (url ? new URL(url).hostname : 'note'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'note';
  const path = `src/content/notes/${now.toISOString().slice(0, 10)}-${stamp.slice(9)}-${slugBase}.md`;

  const text = [
    '---',
    title ? `title: ${JSON.stringify(title)}` : null,
    url ? `url: ${JSON.stringify(url)}` : null,
    url ? `archive: ${JSON.stringify('https://web.archive.org/web/2/' + url)}` : null,
    `date: ${now.toISOString()}`,
    tags.length ? `tags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]` : null,
    draft ? 'draft: true' : null,
    inbox ? 'inbox: true' : null,
    `source: ${source}`,
    '---',
    '',
    note,
    '',
  ]
    .filter((l) => l !== null)
    .join('\n');

  return { path, text };
}

// Adds or removes one tag in a note's frontmatter, preserving everything else.
// Handles both `tags: ["a", "b"]` (what buildNote writes) and a block list
// (`tags:` followed by `  - a` lines, as in Keep imports).
export function setNoteTag(text, tag, on) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') throw new Error('note has no frontmatter');
  const end = lines.indexOf('---', 1);
  if (end < 0) throw new Error('note frontmatter is not closed');

  let tags = [];
  let start = -1;
  let count = 0;
  for (let i = 1; i < end; i++) {
    const m = lines[i].match(/^tags:\s*(.*)$/);
    if (!m) continue;
    start = i;
    count = 1;
    if (m[1].trim().startsWith('[')) {
      tags = m[1].trim().slice(1, -1).split(',').map(unquote).filter(Boolean);
    } else {
      while (start + count < end && /^\s+-\s/.test(lines[start + count])) {
        tags.push(unquote(lines[start + count].replace(/^\s+-\s*/, '')));
        count++;
      }
    }
    break;
  }

  const had = tags.includes(tag);
  if (on === had) return text;
  tags = on ? [...tags, tag] : tags.filter((t) => t !== tag);
  const line = `tags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]`;
  if (start >= 0) lines.splice(start, count, line);
  else lines.splice(end, 0, line);
  return lines.join(nl);
}

function unquote(s) {
  s = s.trim();
  return /^(["']).*\1$/.test(s) ? s.slice(1, -1) : s;
}

// Asks the Wayback Machine to snapshot a link (fire-and-forget).
export function archiveUrl(context, url) {
  context.waitUntil(
    fetch(`https://web.archive.org/save/${url}`, {
      headers: { 'User-Agent': 'lloydio-capture' },
      redirect: 'manual',
    }).catch(() => {})
  );
}

// Comparable form of a URL for duplicate checks: no tracking params or
// fragment (incl. `#:~:text=` highlights), lowercase host, no trailing slash.
const TRACKING = new Set(['selection', 'triedredirect', 'fbclid', 'gclid', 'ref', 'ref_src']);
export function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) {
      if (k.toLowerCase().startsWith('utm_') || TRACKING.has(k.toLowerCase())) u.searchParams.delete(k);
    }
    u.hostname = u.hostname.toLowerCase();
    return u.toString().replace(/\/$/, '');
  } catch {
    return raw;
  }
}
