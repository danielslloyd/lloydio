# BacklogCast — the podcast pipeline

BacklogCast is absorbed into this repo (a rewrite of the original
`danielslloyd/BacklogCast` idea): flag a link, and it comes back as a
narrated episode on a private feed plus a clean-text page on the site.

## Flow

```
capture with "podcast" checked
      │  (tag: podcast on the note)
      ▼
GitHub Action .github/workflows/backlogcast.yml
  (daily cron + on new captures + manual run)
      │  runs pipeline/backlogcast.mjs:
      │    1. queue = podcast-tagged notes without an article yet
      │             + articles still missing audio
      │    2. fetch page → Readability → clean markdown
      │    3. edge-tts → public/media/audio/<slug>.mp3
      │    4. write src/content/articles/<slug>.md
      │  commits results to main
      ▼
site rebuilds automatically
  /reading                     table: original ↗ · ▶ listen · text · status
  /reading/<slug>              clean text + inline player
  /podcast/<FEED_TOKEN>.xml    private RSS feed with enclosures
  /api/podcast-queue.json      machine-readable queue (for external tools)
```

## The private feed

- URL: `/podcast/<FEED_TOKEN>.xml`. Set `FEED_TOKEN` to a long random string
  in the Cloudflare Pages build environment (public project); the feed URL
  is then unguessable. Unset, it defaults to `/podcast/feed.xml` for dev.
- Subscribe by pasting the full URL into any podcast app ("add by URL").
- `robots.txt` disallows `/podcast/` and the feed sets `itunes:block`.
  This is privacy-by-obscurity — fine for a personal feed, not real auth.

## Configuration

- Voice: `EDGE_TTS_VOICE` in the workflow (default `en-US-ChristopherNeural`;
  list options with `edge-tts --list-voices`).
- The workflow needs no secrets: it uses the built-in `GITHUB_TOKEN` with
  `contents: write`.
- Audio lives in the repo (`public/media/audio/`). At ~0.4 MB/min it takes
  a lot of episodes to matter; if the repo gets heavy, move old episodes to
  object storage and change each article's `audio:` frontmatter to the
  absolute URL — the feed and pages follow it automatically.

## Interop for external tools

Anything else (a local model, another repo, a cron job on a laptop) can
participate using the same contract the pipeline uses:

- **Read the queue**: `GET /api/podcast-queue.json` on the deployed site, or
  run `npm run backlogcast -- --dry-run` in a checkout. Each item carries
  its `slug`, `article_path`, and suggested audio paths.
- **Write back**: commit the article markdown to `items[].article_path`
  (frontmatter: `title`, `url`, `date`, `status: ready`, optional `audio`)
  and the mp3 to `suggested_audio_repo_path` — via git or the GitHub
  Contents API. The site and feed pick both up on the next build.
- Slugs are deterministic (`src/lib/reading.ts`), so independent tools
  converge on the same filenames.

## Article lifecycle

`queued` (flagged, nothing generated) → `ready` (text + audio exist) →
`read` (set by hand/skill when done). Setting `draft: true` on an article
hides it from the public site but keeps it in the feed.
