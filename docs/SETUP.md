# Setup: from zero to a working end-to-end capture loop

Follow in order. Time: ~45 min active, plus DNS propagation wait.

## 0. Create `main`

The deploys, the capture function, and the Action all target `main`,
which doesn't exist yet:

```sh
git clone https://github.com/danielslloyd/lloydio && cd lloydio
git checkout claude/personal-website-gwern-93ldui
git checkout -b main && git push -u origin main
```

Then on GitHub: **Settings → General → Default branch → `main`**.
Also consider **making the repo private** — drafts and unprocessed Keep
imports are hidden on the public site but fully visible in a public repo.
Cloudflare Pages deploys private repos fine.

## 1. Generate secrets (keep in a password manager)

```sh
openssl rand -hex 24   # CAPTURE_TOKEN
openssl rand -hex 24   # FEED_TOKEN
```

GitHub PAT for the capture function: github.com → Settings → Developer
settings → **Fine-grained tokens** → Generate new. Repository access:
*Only select repositories* → `lloydio`. Permissions: **Contents → Read and
write**. Longest expiration; set a renewal reminder. This is `GH_TOKEN`.

## 2. Public site on Cloudflare Pages

1. Sign up at dash.cloudflare.com (free plan).
2. **Workers & Pages → Create → Pages → Connect to Git** → authorize
   GitHub → pick `danielslloyd/lloydio`. Production branch: `main`.
3. Build command `npm run build` · output directory `dist`.
4. Environment variables (Production):

   | var | value |
   | --- | --- |
   | `NODE_VERSION` | `22` |
   | `CAPTURE_TOKEN` | secret from step 1 (encrypt) |
   | `GH_TOKEN` | the PAT (encrypt) |
   | `GH_REPO` | `danielslloyd/lloydio` |
   | `GH_BRANCH` | `main` |
   | `FEED_TOKEN` | secret from step 1 (encrypt) |

5. Deploy → you get `https://<project>.pages.dev`. Sanity-check `/`,
   `/reading`, `/api/podcast-queue.json`.

## 3. Owner-mode site (drafts + edit links)

1. Second Pages project, same repo, name it e.g. `lloydio-owner`.
   Same build settings + `NODE_VERSION=22`, plus **`DRAFTS=1`**.
2. Protect it: **Zero Trust** (one-time: pick a team name, Free plan) →
   **Access → Applications → Add → Self-hosted**. Application domain:
   `lloydio-owner.pages.dev` (add `*.lloydio-owner.pages.dev` too for
   preview URLs). Policy: Allow → Include → Emails →
   `danielslloyd@gmail.com`. Login method: one-time PIN is on by default.
3. Visit it: you should get an email-PIN gate, then the site with the
   "owner mode" banner, the draft essay, `/inbox`, and edit links.

## 4. Domain (purchased at Squarespace)

Move DNS to Cloudflare (Squarespace keeps the registration; apex CNAMEs
to Pages don't work on Squarespace DNS):

1. Cloudflare dashboard → **Add a site** → your domain → **Free** plan.
   Cloudflare shows two nameservers (e.g. `ada.ns.cloudflare.com`).
2. Squarespace: **Domains → your domain → DNS → Nameservers → Use custom
   nameservers** → paste both → save. Wait for Cloudflare's "site active"
   email (minutes to hours).
3. Public Pages project → **Custom domains → Add** → `yourdomain.com`
   (and `www.yourdomain.com` if you want) → Cloudflare creates the records.
4. Optional: give owner mode a subdomain — add `drafts.yourdomain.com` as
   a custom domain on the owner project, and change the Access
   application's domain to match.
5. Update the code to the real domain, commit, push:

   ```sh
   # astro.config.mjs → site: 'https://yourdomain.com'
   git commit -am "config: set production domain" && git push
   ```

   (Absolute URLs in the RSS and podcast feeds come from this.)

## 5. Phone capture (PWA)

**Android/Chrome:** visit the site → ⋮ → **Add to Home screen → Install**.
Open the app once, go to `/capture`, paste your `CAPTURE_TOKEN` into the
token field (it's remembered), save a test note. After install, the app
appears in the system **Share** sheet — share from any browser/app and the
form is pre-filled.

**iPhone/Safari:** Share → **Add to Home Screen**. iOS doesn't support PWA
share targets, so the home-screen icon opens `/capture` directly — paste
or type there. (A Shortcuts automation can wrap it later.)

## 6. Desktop capture (Chrome/Edge extension + bookmarklet)

1. You need the `extension/` folder locally (you cloned the repo in step 0).
2. Chrome: `chrome://extensions` · Edge: `edge://extensions` → enable
   **Developer mode** → **Load unpacked** → select the `extension/` folder.
3. Click the extension icon → **settings** → site origin
   (`https://yourdomain.com`) + `CAPTURE_TOKEN` → save.
4. Zero-install alternative: open `/capture` on the site and drag the
   **capture→lloydio** bookmarklet (under "desktop bookmarklet") to the
   bookmarks bar.

## 7. End-to-end test — one capture of each type

Before testing, delete the placeholder sample episode so the pipeline runs
for real:

```sh
git rm src/content/articles/commonplace-book-7fcab6.md \
       public/media/audio/commonplace-book-7fcab6.wav
git commit -m "chore: remove sample episode" && git push
```

Each capture should produce a `capture: …` commit on `main` within
seconds and appear on the site after the ~1 min rebuild.

| # | send | how | expect |
| - | ---- | --- | ------ |
| 1 | plain thought, no URL | extension or `/capture`, note text only | `/notes` under today; `[archive]` absent; owner mode shows an `inbox` chip |
| 2 | any link | phone share sheet → lloydio → save | `/notes` with title + `[archive]` link to the Wayback snapshot |
| 3 | an article, **podcast checked** | extension, tick *queue for podcast* | note tagged `#podcast`; item in `/api/podcast-queue.json`; **Actions → backlogcast** run starts (or trigger via *Run workflow*), commits `backlogcast: new episodes`; after rebuild `/reading` row has ▶ + text; episode in `/podcast/<FEED_TOKEN>.xml` |
| 4 | a quote, tag `commonplace` | any capture path, tags field | appears on `/commonplace` |
| 5 | a pretty link, tag `beautiful` | any | appears on `/beautiful` |
| 6 | an infographic link, tag `infographics` | any | appears on `/infographics` |
| 7 | "read <book> by <author>", tag `books` | any | sits in inbox until processing (next step) turns it into a `/books` row |

Podcast app test: copy `https://yourdomain.com/podcast/<FEED_TOKEN>.xml`
into any app that supports "add by URL" (Pocket Casts, Overcast,
AntennaPod) and the episode from #3 should download and play.

## 8. Local test run

```sh
git pull                       # get the machine commits from step 7
npm install
npm run build                  # must pass; DRAFTS=1 npm run build for owner view
npm run dev                    # http://localhost:4321
npm run inbox                  # lists captures 1–7 as unprocessed
npm run backlogcast -- --dry-run   # shows the podcast queue
pip install edge-tts           # then a real local pipeline run:
npm run backlogcast            # fetch + narrate anything still queued
```

Then process the inbox: open the repo in Claude Code/Cowork and say
**"process the inbox"** (runs the `process-inbox` skill) — capture #7
should become an entry on `/books` with store links, #4–6 get cleaned and
published, and `npm run inbox` returns to zero.

## Troubleshooting

- **Capture returns 401** — token in the app/extension doesn't match
  `CAPTURE_TOKEN`; re-paste, watch for trailing whitespace.
- **Capture returns 502 `github 401/403`** — `GH_TOKEN` wrong, expired, or
  missing Contents write on the repo.
- **Saved but never appears** — check the Pages build log; a schema error
  in a hand-edited file fails the build (`npm run build` locally to see it).
- **backlogcast run is green but no audio** — check the run log: a `fetch
  403/404` means the site blocks bots (article saved textless and retried);
  edge-tts errors mean the voice name is wrong.
- **Feed 404** — the feed path embeds `FEED_TOKEN` at build time; it only
  exists after a deploy *with* that env var set.
