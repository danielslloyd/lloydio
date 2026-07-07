# lloydio — guide for agents

Personal site (Astro, static) + capture pipeline + BacklogCast podcast
pipeline. Read `README.md` for the human-facing overview and
`docs/BACKLOGCAST.md` for the podcast contract.

## Map

- `src/content/notes/` — the dump. Frontmatter flags: `inbox` (unprocessed),
  `draft` (owner-mode only), `source` (capture|keep|manual), tag `podcast`
  (queued for narration). Category tags with top-level pages: `books`,
  `commonplace`, `beautiful`, `infographics`.
- `src/content/articles/` — article reading list; **written by the
  BacklogCast pipeline, don't hand-edit bodies** (frontmatter tweaks like
  `status: read` are fine).
- `src/content/books/` — book reading list (see process-inbox skill for shape).
- `src/content/essays/` — long-form writing.
- `pipeline/backlogcast.mjs` — link → clean markdown + TTS mp3; runs via
  `.github/workflows/backlogcast.yml`.
- `functions/api/capture.js` — Cloudflare Pages Function; commits captures.
- `scripts/ingest-keep.mjs`, `scripts/inbox.mjs` — ingestion + inbox listing.

## Commands

```sh
npm run dev          # local dev (no search index)
npm run build        # must pass before committing content/schema changes
DRAFTS=1 npm run build   # owner-mode build (drafts + edit links)
npm run inbox        # list unprocessed notes (--json for machines)
npm run ingest-keep -- <Takeout/Keep dir>
npm run backlogcast -- --dry-run   # show the podcast queue
```

## Skills

- `process-inbox` — triage/categorize the note dump. Follow it exactly;
  it defines the categorization rules and hard rules (no invented links,
  keep-when-unsure, drafts stay drafts when personal).
- `ingest-keep` — import a Google Keep export.

## Conventions

- Content schema lives in `src/content.config.ts`; run a build after
  changing any frontmatter shape.
- Slug logic for articles is duplicated in `src/lib/reading.ts` and
  `pipeline/backlogcast.mjs` — keep them in sync.
- Commit messages: `capture:` (machine), `backlogcast:` (machine),
  `process:` (inbox triage), `ingest:` (bulk imports).
- Never commit secrets; tokens live in Cloudflare/GitHub settings.
