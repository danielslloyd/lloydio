# lloydio capture — browser extension

A Chrome/Edge (Manifest V3) extension with two ways to capture to lloyd.studio:

- **Right-click → "Send to lloyd.studio"** — one click, no form. Appears when
  you right-click a page, selected text, a link, or an image, and grabs the
  most specific target:
  - right-click a **link** → captures that link's URL (+ its anchor text as title)
  - right-click an **image** → captures the image URL
  - **select text** first → the selection becomes the note, the page is the URL
  - anywhere on the **page** → captures the current page URL + title
- **Toolbar button** → a small popup for when you want to add a note, tags, or
  tick *queue for podcast* before saving.

Captures land in the notes **inbox** (unprocessed) just like phone captures;
process them later with the `process-inbox` skill.

## Install (unpacked)

1. Clone this repo so you have the `extension/` folder locally.
2. Chrome: `chrome://extensions` · Edge: `edge://extensions` → turn on
   **Developer mode** → **Load unpacked** → select this `extension/` folder.
3. Click the extension's icon → **settings** (or right-click the icon →
   Options) and set:
   - **site origin**: `https://lloyd.studio`
   - **capture token**: your `CAPTURE_TOKEN`
4. Right-click any page → **Send to lloyd.studio**. You'll get a ✓ badge on
   the toolbar icon and a toast on success (a `!` badge on failure).

## Notes

- Feedback is a toolbar-icon badge (✓/!) plus a desktop notification.
- The right-click item is a single flat entry like "Save to Keep". Chrome
  decides its position in the menu relative to other extensions — that
  ordering isn't controllable by an extension.
- No build step; it's plain files. Bump `version` in `manifest.json` when you
  change it, then hit **Reload** on the extensions page.
