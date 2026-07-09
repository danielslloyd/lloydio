---
name: process-inbox
description: Work through unprocessed notes in the inbox — file each into the right consolidated category doc (commonplace/beautiful/infographics), the book list, or the drafts bucket, then delete the note. Use when asked to "process the inbox", "clean up my notes", or "triage my dump".
---

# Process the notes inbox

Inbox items are notes with `inbox: true` in their frontmatter — raw captures
from the phone/extension and items ingested from Google Keep. Curated content
lives in **consolidated single files**, not per-note. Your job: move each
inbox note's content into the right consolidated file, then **delete the note
file**.

## Where things go

| the note is… | put it in | how |
| --- | --- | --- |
| a quote, aphorism, fact, passage | `src/content/docs/commonplace.md` | append a paragraph (or a `## Heading` + paragraphs for a multi-part entry); quotes as a blockquote with attribution |
| a link kept for its visual/aesthetic value | `src/content/docs/beautiful.md` | append `[title](url)` + a line on why |
| an infographic / chart / dense diagram | `src/content/docs/infographics.md` | append the link/image + a note |
| a book (title/author, "should read") | `src/content/books.yaml` | add an entry (see shape below) |
| unclear / half-baked / needs sorting | `src/content/drafts.yaml` | add `{ id, category, text, note?, source }` — the owner-only triage bucket |
| a long-form article to read/listen | leave the note, keep its `podcast` tag | BacklogCast handles it; don't add the tag unprompted |
| junk, duplicate, dead link | — | delete the note file |
| genuinely a one-off worth keeping as-is | leave it in `src/content/notes/` | just remove the `inbox: true` line |

After filing a note's content, **delete the note file** (that's what marks it
done). Don't leave the content in two places.

## Workflow

1. List the inbox: `node scripts/inbox.mjs` (add `--json` for full detail).
2. Work in **small batches** (~10, oldest first). For each note: read it, decide
   the destination, append/add there, then delete the note file.
3. After each batch, `npm run build` (catches malformed YAML/markdown), then
   commit: `process: <short summary>` — e.g.
   `process: 12 keep items — 4 commonplace, 3 books, 5 drafts`.

## Book entries (`src/content/books.yaml`)

```yaml
- id: "goodreads-id-or-slug"      # unique
  title: "The Book Title"
  author: "Author Name"
  date: 2026-07-09                 # when added
  status: to-read                  # to-read | reading | finished
  rating: 4                        # optional, 1–5
  links:
    goodreads: https://…
    amazon: https://…
    audible: https://…
  source: manual
```

- Find real pages with web search when available. **Never fabricate a direct
  link** — use search URLs if you can't verify one:
  - `https://www.goodreads.com/search?q=<title>+<author>`
  - `https://www.amazon.com/s?k=<title>+<author>`
  - `https://www.audible.com/search?keywords=<title>+<author>`
- Check for dupes (search the existing `id`/title in `books.yaml`) first.

## Hard rules

- Never delete or rewrite content you can't re-derive (quotes, personal
  reminders). When unsure, drop it in `drafts.yaml` rather than publish or
  delete.
- Never invent URLs, authors, or attributions.
- Don't touch `src/content/articles/` — that directory belongs to the
  BacklogCast pipeline (`pipeline/backlogcast.mjs`).
- Personal / half-baked prose that isn't ready for the public doc goes in
  `drafts.yaml` (owner-only), not the category doc.
