---
name: ingest-keep
description: Import a Google Keep export (Google Takeout) into the site's notes inbox. Use when the user provides a Keep/Takeout export zip or folder and wants it ingested as seed content.
---

# Ingest a Google Keep export

## Steps

1. Get the export. The user downloads it from https://takeout.google.com
   (select only Keep). It's a zip containing `Takeout/Keep/` with one
   `.json` + `.html` per note, plus attachment files.
2. Unzip if needed: `unzip -o <export.zip> -d /tmp/takeout`
3. Run the converter:

   ```sh
   npm run ingest-keep -- /tmp/takeout/Takeout/Keep
   ```

   Each Keep note becomes a file in `src/content/notes/` with
   `inbox: true`, `draft: true`, `source: keep`; Keep labels become tags;
   attachments are copied to `public/media/keep/` and embedded.
   The script is idempotent — re-running skips already-imported notes.

4. Sanity-check: `npm run build` must pass; `npm run inbox` should list the
   new items. Spot-check a few files against the originals.
5. Commit the raw import as-is (`ingest: google keep export, N items`)
   **before** any processing, so there's a clean snapshot of the source.
6. Then run the `process-inbox` skill to categorize and publish in batches.
   For a large junk drawer expect multiple sessions; progress is durable
   because processed items lose their `inbox` flag.

## Notes

- Everything arrives as `draft: true`, so nothing becomes public until
  processing explicitly publishes it. Safe to import first, curate later.
- Trashed Keep notes are skipped. Archived/pinned status is preserved as a
  comment in the frontmatter.
