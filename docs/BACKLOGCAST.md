# BacklogCast — the podcast pipeline

Flag a link, and it comes back as a narrated episode on a private feed plus a
clean-text page on the site. lloydio owns **capture, the queue, the text, the
audio hosting, and the always-on feed**; the owner's desktop
([BacklogCast](https://github.com/danielslloyd/BacklogCast) + the Henty GPU
TTS studio) does the **production** — so episodes get made while the desktop
is on, and stay downloadable when it's off.

## Flow

```
/capture with "podcast" checked, or /reading → edit → add (owner site)
      │  commits src/content/notes/<…>.md tagged `podcast`
      ▼
/api/podcast-queue.json          (podcast notes without an article yet,
      │                           + articles still missing audio)
      │  polled every LLOYDIO_POLL_SECONDS by BacklogCast on the desktop
      ▼
BacklogCast (desktop)
  1. fetch the URL as a browser would (HTML or PDF; curl / Substack-API fallbacks)
  2. trafilatura draft → headless Claude (`claude -p`) writes the clean reading text
  3. Henty narrates it (Chatterbox, with a Whisper check per chunk) → mp3
  4. POST /api/episode  (multipart: slug, title, url, date, duration, markdown, mp3)
      ▼
/api/episode (Pages Function)
  - mp3 → R2  episodes/<slug>.mp3  (public at https://media.lloyd.studio)
  - commits src/content/articles/<slug>.md  (status: ready, audio: <R2 URL>)
      ▼
site rebuilds automatically
  /reading                     table: original ↗ · ▶ listen · text · status
  /reading/<slug>              clean text + inline player
  /podcast/<FEED_TOKEN>.xml    private RSS feed with enclosures
```

## The private feed

- URL: `/podcast/<FEED_TOKEN>.xml`. Set `FEED_TOKEN` to a long random string
  in the Cloudflare Pages build environment (public project); the feed URL
  is then unguessable. Unset, it defaults to `/podcast/feed.xml` for dev.
- Subscribe by pasting the full URL into any podcast app ("add by URL").
- `robots.txt` disallows `/podcast/` and the feed sets `itunes:block`.
  This is privacy-by-obscurity — fine for a personal feed, not real auth.
- Enclosures point at R2 (`audio_bytes` / `duration` frontmatter give the
  length and `itunes:duration`). R2's public domain serves range requests, so
  podcast apps can stream and resume.

## Configuration (Cloudflare)

Public Pages project (the one serving lloyd.studio — BacklogCast posts there):

| Setting          | What |
|------------------|------|
| R2 bucket        | e.g. `lloydio-audio`, with custom domain `media.lloyd.studio` (public) |
| `AUDIO`          | R2 bucket **binding** on the Pages project (Settings → Bindings) |
| `AUDIO_BASE_URL` | optional; defaults to `https://media.lloyd.studio` |
| `EPISODE_TOKEN`  | secret; BacklogCast sends it as `Authorization: Bearer …` (its `LLOYDIO_EPISODE_TOKEN`) |
| `FEED_TOKEN`     | makes the feed URL unguessable |
| `GH_TOKEN`, `GH_REPO`, `GH_BRANCH` | as for `/api/capture` — used to commit the article |

The desktop side is configured in BacklogCast's `backlogcast.env.bat`
(`LLOYDIO_BASE_URL`, `LLOYDIO_POLL_SECONDS`, `LLOYDIO_EPISODE_TOKEN`,
`CLAUDE_EXTRACT`, Henty settings).

## Interop for external tools

Anything else can participate using the same contract:

- **Read the queue**: `GET /api/podcast-queue.json` on the deployed site, or
  `npm run backlogcast` in a checkout. Each item carries its `slug` and
  `article_path`.
- **Write back**: `POST /api/episode` as above, or commit the article
  markdown to `items[].article_path` yourself (frontmatter: `title`, `url`,
  `date`, `status: ready`, `audio` — relative `/media/audio/…` or an absolute
  URL — plus optional `audio_bytes`, `duration`).
- Slugs are deterministic (`src/lib/reading.ts`), so independent tools
  converge on the same filenames.

## Article lifecycle

`queued` (flagged, nothing generated) → `ready` (text + audio exist) →
`read` (set by hand/skill when done). Setting `draft: true` on an article
hides it from the public site but keeps it in the feed.
