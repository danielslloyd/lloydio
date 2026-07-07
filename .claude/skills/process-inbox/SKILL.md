---
name: process-inbox
description: Work through unprocessed notes in the inbox — categorize, clean up, extract books into the reading list, flag articles for the podcast, and publish. Use when asked to "process the inbox", "clean up my notes", or "triage my dump".
---

# Process the notes inbox

Inbox items are notes with `inbox: true` in their frontmatter — raw captures
from the phone/extension and items ingested from Google Keep. Your job is to
turn each one into something clean and correctly categorized, then remove it
from the inbox.

## Workflow

1. List the inbox: `node scripts/inbox.mjs` (add `--json` for full detail).
2. Process items **in small batches** (~10 at a time), oldest first. For each
   item, read the file and decide its categories (an item can have several).
3. After each batch, build (`npm run build`) to catch schema mistakes, then
   commit with message `process: <short summary>` — e.g.
   `process: 12 keep items — 3 books, 2 commonplace, 1 podcast flag`.

## Categorization rules

Apply tags; tags drive the top-level pages:

| signal in the note | action |
| --- | --- |
| mentions a book (title/author, "should read", reading list) | tag `books` **and** create/update an entry in `src/content/books/` (see below) |
| long-form article the owner wants to read/listen to | keep `podcast` tag if present; do not add it unprompted — ask or leave a TODO |
| quote, aphorism, passage, "commonplace" material | tag `commonplace`; put the quote itself in the body as a blockquote with attribution |
| link kept for its visual/aesthetic value | tag `beautiful` |
| infographic, chart, dense diagram (esp. image attachments) | tag `infographics` |
| everything else worth keeping | leave untagged (it stays in /notes) or tag topically |
| junk, duplicates, dead links | delete the file (note it in the commit message) |

## Book entries

For each book found, create `src/content/books/<slug>.md`:

```markdown
---
title: "The Book Title"
author: "Author Name"
date: 2026-07-07            # when the note was captured
status: to-read
links:
  goodreads: https://…
  amazon: https://…
  audible: https://…
---
Optional: why it was captured / who recommended it (from the note).
```

- Find real product/book pages with web search when available. **Never
  fabricate a direct link** — if you can't verify one, use search URLs:
  - `https://www.goodreads.com/search?q=<title>+<author>`
  - `https://www.amazon.com/s?k=<title>+<author>`
  - `https://www.audible.com/search?keywords=<title>+<author>`
- Don't duplicate: check existing files in `src/content/books/` first.
- If the note was *only* a book mention, the note file can be deleted after
  the book entry is created; if it has other content, keep both.

## Cleanup of each processed note

- Give it a real `title` if missing or garbled.
- Fix obvious typos in the body; don't rewrite the owner's voice.
- Keep-imported items arrive with `draft: true`. Set `draft: false` if the
  content is fine to be public; leave it draft if it looks personal/private
  — when unsure, leave it draft and note that in the commit message.
- Finally remove the `inbox: true` line (that's what marks it processed).

## Hard rules

- Never delete or rewrite content you can't re-derive (quotes, personal
  reminders) — when in doubt, keep it and just tag it.
- Never invent URLs, authors, or attributions.
- Don't touch `src/content/articles/` — that directory belongs to the
  BacklogCast pipeline (`pipeline/backlogcast.mjs`).
