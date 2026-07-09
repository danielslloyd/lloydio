# lloydio

A personal website in the spirit of [gwern.net](https://gwern.net/design) —
monochrome serif typography, sidenotes, hover link previews, dark mode —
built as a plain static site so it costs ~nothing to run and maintain.

It also works as a **daily dumping ground**: links and notes captured from a
phone (PWA share sheet) or desktop (browser extension / bookmarklet) are
committed straight to this repo as markdown files, which triggers a rebuild.
Everything you capture is a plain text file you own, versioned in git forever.

Captured notes flow through a lightweight lifecycle: they arrive in an
**inbox** (`inbox: true`), get processed — by you, or by Claude
Code/Cowork sessions following the repo's skills — into categorized,
cleaned-up entries, and links flagged with the **podcast** checkbox are
narrated into episodes on a private feed by the built-in BacklogCast
pipeline (see `docs/BACKLOGCAST.md`).

## Layout

Curated categories are **one file each** (edit/reorder in one place);
captured/streaming content stays **one file per item**.

```
src/content/docs/     curated category docs — commonplace.md, beautiful.md, infographics.md
src/content/books.yaml  book reading list — one consolidated file
src/content/drafts.yaml owner-only triage bucket (held-back/unsorted items)
src/content/notes/    the link/note dump + one-offs — one file per capture
src/content/articles/ article reading list — written by the BacklogCast pipeline
src/content/essays/   long-form pages (markdown + front-matter)
src/pages/apps/       small personal tools (pomodoro, quiz) — localStorage only
public/media/         audio/text from other projects; episodes in media/audio/
public/decks/         quiz decks (JSON) — add a file + list it in index.json
functions/api/        the capture endpoint (Cloudflare Pages Function)
extension/            desktop browser extension (load unpacked)
pipeline/             BacklogCast: flagged link → clean markdown + TTS episode
scripts/              ingest-keep (Google Keep import) + inbox lister
.claude/skills/       processing instructions for Claude Code/Cowork sessions
```

## The processing loop

- **Capture** all day (phone share sheet, extension, bookmarklet). Everything
  lands in `/notes` immediately and carries `inbox: true`.
- **Process** whenever: open the repo in Claude Code/Cowork and say
  "process the inbox" — the `process-inbox` skill files each note into the
  right consolidated file (books → `books.yaml`, quotes → `commonplace.md`,
  visuals → `beautiful.md` / `infographics.md`, unsure → `drafts.yaml`) and
  deletes the note. `npm run inbox` shows what's pending; owner mode has an
  `/inbox` page.
- **Listen**: anything captured with the podcast checkbox is picked up by the
  `backlogcast` GitHub Action (daily + after captures), which fetches the
  article, extracts clean text, narrates it with edge-tts, and commits both.
  `/reading` shows the table (original ↗ · listen ▶ · clean text · status);
  the private RSS feed lives at `/podcast/<FEED_TOKEN>.xml`.

## Seeding from Google Keep

Export from https://takeout.google.com (Keep only), then:

```sh
npm run ingest-keep -- path/to/Takeout/Keep
```

Every Keep note becomes an inbox item (draft, owner-mode-only until
processed); labels become tags; attachments are copied to
`public/media/keep/`. Then run the `process-inbox` skill to sort the junk
drawer into the categories above. See `.claude/skills/ingest-keep/`.

## Local development

```sh
npm install
npm run dev        # http://localhost:4321 (search is disabled in dev)
npm run build      # full build incl. search index → dist/
DRAFTS=1 npm run build   # owner-mode build (drafts + edit links)
```

## Deploying (Cloudflare Pages, recommended)

You deploy the repo **twice** from the same code — a public site and a
private "owner mode" site:

1. **Public site** — Cloudflare dashboard → Workers & Pages → Create →
   Pages → connect this repo.
   - Build command: `npm run build` · output directory: `dist`
   - Every push to `main` (including captures) redeploys automatically.
2. **Owner-mode site** — create a *second* Pages project on the same repo.
   - Same build settings, plus environment variable `DRAFTS=1`.
   - Protect it with **Cloudflare Zero Trust → Access** (free): create an
     Access application for the owner-mode domain, policy = allow only your
     email. You log in with a one-time code or Google; nobody else gets in.
   - This deployment shows drafts, draft chips, and per-page **edit** links
     that jump straight to editing the file on GitHub.
3. **Custom domain** — add it to the public project, then set `site` in
   `astro.config.mjs` to match.

(Netlify works too — the site itself is plain static output — but you'd need
to port `functions/api/capture.js` to a Netlify Function and pay for password
protection on the owner-mode deploy, which is why Cloudflare is recommended.)

### Capture endpoint setup

The endpoint lives at `/api/capture` on the **public** Pages project. Set
these environment variables on that project (Settings → Variables, encrypt
the secrets):

| variable        | value                                                        |
| --------------- | ------------------------------------------------------------ |
| `CAPTURE_TOKEN` | a long random string (`openssl rand -hex 24`)                 |
| `GH_TOKEN`      | GitHub fine-grained PAT, this repo only, **Contents: write** |
| `GH_REPO`       | `danielslloyd/lloydio`                                        |
| `GH_BRANCH`     | `main`                                                        |
| `FEED_TOKEN`    | another long random string — makes the private podcast feed URL (`/podcast/<FEED_TOKEN>.xml`) unguessable |

Each capture becomes `src/content/notes/<date>-<time>-<slug>.md`, the commit
triggers a rebuild (~1 min to live), and the linked URL is submitted to the
Internet Archive's Wayback Machine automatically — the note's `[archive]`
link points at the latest snapshot.

### Capturing from your phone (PWA)

1. Visit the site in Chrome/Android or Safari/iOS → "Add to Home Screen".
2. Open the installed app once, go to `/capture`, and paste your
   `CAPTURE_TOKEN` (it's remembered per-browser).
3. On Android the app now appears in the system **Share** menu — share any
   page from the browser and it pre-fills the capture form. On iOS, share →
   open in the PWA, or keep a home-screen bookmark to `/capture`.

### Capturing from desktop

- **Extension**: `chrome://extensions` → enable Developer mode → "Load
  unpacked" → select the `extension/` folder. Open its settings and enter
  your site origin and token. (Firefox: `about:debugging` → Load Temporary
  Add-on.)
- **Bookmarklet**: the `/capture` page generates one you can drag to your
  bookmarks bar — no extension needed.

## Writing

- **Essay**: add `src/content/essays/my-essay.md` with front-matter
  `title`, `date`, optional `description`/`tags`/`updated`, and
  `draft: true` while it's in progress.
- **Note by hand**: add a file to `src/content/notes/` (see existing ones).
- **Footnotes** (`[^1]`) become margin **sidenotes** on wide screens and get
  hover popups. Internal links get hover **previews**. `<details>` blocks
  give collapsible sections. All of it degrades gracefully without JS.

## Features inherited from gwern.net (and what was deliberately skipped)

Included: sidenotes · link/footnote hover previews (lite, own-content only) ·
collapsible sections · dark mode (auto + toggle) · monochrome serif
typography with dropcaps/smallcaps · client-side full-text search (Pagefind) ·
tags · RSS · archive.org snapshots for captured links.

Skipped on purpose (maintenance cost ≫ value at this scale): the annotation
database behind gwern's rich popups, full local link mirroring, transclusion,
backlinks, ML-based similar-page recommendations, reader mode, Hakyll.
