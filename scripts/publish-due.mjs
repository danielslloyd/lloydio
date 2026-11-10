// Publishes narrated drafts whose `publish_on` day has arrived: sets
// `draft: false`, stamps `feed_date` (the episode's pubDate), drops
// `publish_on`. Run daily by .github/workflows/publish-due.yml.
//   node scripts/publish-due.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';

const dir = 'src/content/articles';
const dry = process.argv.includes('--dry');
const today = new Date().toISOString().slice(0, 10);
const now = new Date().toISOString();
let n = 0;

for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
  const p = path.join(dir, f);
  const text = fs.readFileSync(p, 'utf8');
  const m = text.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!m) continue;
  const fm = m[2];
  const on = (fm.match(/^publish_on:\s*["']?(\d{4}-\d{2}-\d{2})/m) || [])[1];
  if (!on || on > today) continue;
  if (!/^audio:/m.test(fm) || !/^draft:\s*true\s*$/m.test(fm)) continue;
  const set = (s, k, v) => (new RegExp(`^${k}:.*$`, 'm').test(s)
    ? s.replace(new RegExp(`^${k}:.*$`, 'm'), `${k}: ${v}`)
    : s + `\n${k}: ${v}`);
  let next = set(fm, 'draft', 'false');
  next = set(next, 'feed_date', now).replace(/^publish_on:.*(\r?\n|$)/m, '');
  console.log(`publish ${f} (scheduled ${on})`);
  n++;
  if (!dry) fs.writeFileSync(p, text.replace(m[0], m[1] + next + m[3]));
}
console.log(n ? `${n} published` : 'nothing due');
