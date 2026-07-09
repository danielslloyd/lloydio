# lloydio — guide for agents

Personal site (Astro, static) + capture pipeline + BacklogCast podcast
pipeline. Read `README.md` for the human-facing overview and
`docs/BACKLOGCAST.md` for the podcast contract.

## Map

Curated content is **consolidated into single files**; streaming/machine-written
content stays **per-file**.

- `src/content/notes/` — the dump + one-offs (per-file). Frontmatter flags:
  `inbox` (unprocessed), `draft` (owner-mode only), `source`
  (capture|keep|manual), tag `podcast` (queued for narration). The
  `process-inbox` skill files these into the consolidated docs below and
  deletes the note.
- `src/content/docs/` — the curated category docs: `commonplace.md`,
  `beautiful.md`, `infographics.md`. **One editable markdown file per
  category**; rendered by `src/components/CategoryDoc.astro` at
  `/commonplace` etc.
- `src/content/books.yaml` — book reading list, one file (`file()` loader).
  Each entry needs a unique `id`. Rendered by `src/pages/books.astro`.
- `src/content/drafts.yaml` — owner-only triage bucket (held-back/unsorted
  items, `category` per row); shown only in `DRAFTS=1` builds under each
  category doc.
- `src/content/articles/` — article reading list; **written by the
  BacklogCast pipeline, don't hand-edit bodies** (frontmatter tweaks like
  `status: read` are fine).
- `src/content/essays/` — long-form writing (per-file).
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

- `process-inbox` — triage the note dump into the consolidated category
  docs / `books.yaml` / `drafts.yaml`, deleting each note once filed.
  Follow it exactly (no invented links, park-when-unsure in drafts.yaml).
- `ingest-keep` — import a Google Keep export.

## Conventions

- Content schema lives in `src/content.config.ts`; run a build after
  changing any frontmatter shape. Curated = one file (docs/*.md, books.yaml,
  drafts.yaml); streaming = per-file (notes, articles). Don't point machine
  writers at the consolidated files — they'd conflict.
- Slug logic for articles is duplicated in `src/lib/reading.ts` and
  `pipeline/backlogcast.mjs` — keep them in sync.
- Commit messages: `capture:` (machine), `backlogcast:` (machine),
  `process:` (inbox triage), `ingest:` (bulk imports).
- Never commit secrets; tokens live in Cloudflare/GitHub settings.
