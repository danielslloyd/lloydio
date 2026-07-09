# Setup: from zero to a working end-to-end capture loop

This is the recipe that produced the live site:

- **Public site:** `lloyd.studio` (+ `www.lloyd.studio`) — open to the world.
- **Owner-mode site:** `drafts.lloyd.studio` — same repo built with `DRAFTS=1`,
  gated behind a Cloudflare Access email login (drafts, `/inbox`, edit links).

Both are Cloudflare Pages projects deploying from this repo's `main` branch.
Time: ~45 min active, plus DNS propagation wait. Follow in order.

## 0. Branch

The default branch is **`main`**, and every deploy, the capture function
(`GH_BRANCH=main`), and the BacklogCast Action all target it. A fresh
`git clone` lands you on `main` — nothing to do. Consider **making the repo
private**: drafts and unprocessed Keep imports are hidden on the public
*site* but fully visible in a public *repo*. Cloudflare Pages deploys
private repos fine.

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

> ⚠️ **Use the Pages door, NOT "Import a repository."** In Workers & Pages
> the prominent **"Import a repository"** button is the *Workers* flow — it
> runs `wrangler deploy` and fails for this static site with
> `A Worker named "…" already exists`. You want **Pages**. Tells them apart:
> a Pages project has a `.pages.dev` URL and a globe/document icon; a Worker
> has a `.workers.dev` URL and a `<>` diamond icon. If you accidentally made
> a Worker, delete it and recreate via Pages — the repo is untouched.
> Direct link if the Pages option is buried:
> `https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/pages`

1. Sign up at dash.cloudflare.com (free plan).
2. **Workers & Pages → Create → Pages tab → Connect to Git** → authorize
   GitHub → pick `danielslloyd/lloydio`. Production branch: `main`.
3. Framework preset **Astro** (auto-fills the next two):
   build command `npm run build` · output directory `dist`.
4. Environment variables (Production):

   | var | value | type |
   | --- | --- | --- |
   | `NODE_VERSION` | `22` | plaintext |
   | `CAPTURE_TOKEN` | secret from step 1 | Secret 🔒 |
   | `GH_TOKEN` | the PAT | Secret 🔒 |
   | `GH_REPO` | `danielslloyd/lloydio` | plaintext |
   | `GH_BRANCH` | `main` | plaintext |
   | `FEED_TOKEN` | secret from step 1 | Secret 🔒 |

   > The **Encrypt / "Secret" type** control may not appear in the initial
   > setup wizard. That's fine: add the values as plaintext now, deploy,
   > then **Settings → Variables and Secrets**, set each of the three
   > secrets' **Type → Secret**, and **redeploy** (env changes only apply
   > on the next build). Once a value is a Secret it shows as `••••••` and
   > can't be read back. Encrypt `GH_TOKEN` for sure — it can write to your
   > repo.

5. Deploy → you get `https://<project>.pages.dev`. Sanity-check `/`,
   `/reading`, `/api/podcast-queue.json`.
   (Before `FEED_TOKEN` is set, the feed is at `/podcast/feed.xml`; it
   moves to the secret URL after you add the token and redeploy.)

## 3. Domain on Cloudflare

Cloudflare Access and clean apex domains both want the domain to be an
**active zone in your Cloudflare account** — not just DNS records at your
registrar. (Apex `CNAME`s to Pages don't work on Squarespace/registrar DNS
anyway; Cloudflare's own DNS flattens them for you.)

1. Cloudflare dashboard → **Add a site** → `lloyd.studio` → **Free** plan.
   Cloudflare shows you two nameservers (e.g. `xxx.ns.cloudflare.com`).
2. At your registrar (Squarespace, etc.) → the domain's **nameservers** →
   replace with Cloudflare's two → save. Wait for Cloudflare's **"site is
   active"** email — this is the step people skip; adding the site is not
   enough, the nameservers must actually point at Cloudflare.
3. Confirm the zone shows **Active** (green) on its overview page. Until it
   does, custom domains below stay stuck on "Verifying."
4. Public Pages project → **Custom domains → Set up a domain** →
   `lloyd.studio` (repeat for `www.lloyd.studio`). Because the zone is on
   Cloudflare, it **auto-creates the DNS records** — ignore any "add this
   CNAME at your provider" fallback text. Status flips Verifying → Active in
   minutes. (If it sticks: the zone isn't Active yet, or a leftover apex
   `A`/parking record is blocking it — delete that under the zone's
   **DNS → Records**.)

## 4. Owner-mode site + login gate

1. **Second Pages project**, same **Pages** door, same repo. Name it
   `lloydio-drafts`. Same build settings + `NODE_VERSION=22`, **plus
   `DRAFTS=1`**. Deploy.
   > Do **not** put `DRAFTS=1` on the public project — that leaks drafts and
   > shows the "owner mode — drafts visible" banner to the world. It belongs
   > on this project only.
2. Give it the subdomain: this project → **Custom domains → Set up a
   domain** → `drafts.lloyd.studio` (auto-wired, same as step 3.4).
3. **Gate it with Access** — do this on the real subdomain, not the
   `.pages.dev` URL. **Zero Trust** (first time: pick a team name, Free
   plan) → **Access → Applications → Add an application**:
   - **Self-hosted and private** → sub-tab **Public DNS** → Continue.
     (*Not* "Private destinations" — that's for internal apps via a Tunnel
     and needs the WARP client.)
   - Name `lloydio drafts`; session duration ~**1 month**.
   - Public hostname: subdomain `drafts`, domain `lloyd.studio`, path blank.
     ⚠️ Confirm it reads `drafts.lloyd.studio` — never `lloyd.studio`
     (that's your public site; gating it locks everyone out).
   - Policy: name `Allow me`, action **Allow**, Include → **Emails** →
     `danielslloyd@gmail.com`.
   - Login method: leave **One-time PIN** on (emails you a code; no Google/
     IdP setup needed). Save.
4. Test in an **incognito** tab: `drafts.lloyd.studio` should show a
   Cloudflare login → email → PIN → then the site with the "owner mode"
   banner, the draft essay, `/inbox`, and edit links. `lloyd.studio` should
   stay open with none of that.

## 5. Point the code at the real domain

`astro.config.mjs` already has `site: 'https://lloyd.studio'`, which is
where the RSS and podcast feeds build their absolute URLs from. If you ever
change domains, edit that line, then `git commit -am "config: domain" &&
git push`.

## 6. Phone capture (PWA)

**Android/Chrome:** visit `https://lloyd.studio` → ⋮ → **Add to Home screen
→ Install**. Open the app once, go to `/capture`, paste your `CAPTURE_TOKEN`
into the token field (remembered per-browser), save a test note. After
install, the app appears in the system **Share** sheet — share from any
browser/app and the form is pre-filled.

**iPhone/Safari:** Share → **Add to Home Screen**. iOS doesn't support PWA
share targets, so the home-screen icon opens `/capture` directly — paste or
type there. (A Shortcuts automation can wrap it later.)

## 7. Desktop capture (Chrome/Edge extension + bookmarklet)

1. Clone the repo locally so you have the `extension/` folder.
2. Chrome: `chrome://extensions` · Edge: `edge://extensions` → enable
   **Developer mode** → **Load unpacked** → select the `extension/` folder.
3. Click the extension icon → **settings** → site origin
   `https://lloyd.studio` + `CAPTURE_TOKEN` → save.
4. Zero-install alternative: open `/capture` on the site and drag the
   **capture→lloydio** bookmarklet (under "desktop bookmarklet") to the
   bookmarks bar.

## 8. End-to-end test — one capture of each type

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

Podcast app test: copy `https://lloyd.studio/podcast/<FEED_TOKEN>.xml`
into any app that supports "add by URL" (Pocket Casts, Overcast,
AntennaPod) and the episode from #3 should download and play.

## 9. Local test run

```sh
git pull                       # get the machine commits from step 8
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

- **Public site shows an "owner mode — drafts visible" banner** — `DRAFTS=1`
  is set on the public project. Delete that variable (Settings → Variables
  and Secrets) and redeploy. It belongs only on `lloydio-drafts`.
- **`drafts.lloyd.studio` loads without asking for a password** — the Access
  application isn't gating it. Check the app's public hostname is exactly
  `drafts.lloyd.studio` and the policy Includes your email (§4.3). No Access
  app = no gate.
- **Custom domain stuck on "Verifying"** — the zone isn't Active yet
  (finish the nameserver switch, §3.2) or a leftover apex `A`/parking record
  is blocking the auto-created CNAME (delete it under the zone's DNS).
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
