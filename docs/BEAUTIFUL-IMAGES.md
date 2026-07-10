# Plan: showing the images on `/beautiful`

**Goal.** Turn `/beautiful` from a list of text links into a visual page that
actually *shows* the beautiful thing, while keeping the source link. Each entry
should render an image inline; the image should be chosen deliberately (previewed
before it's committed), not scraped blindly.

This is a design/decision doc, not a task list to execute yet. It lays out the
data model, the "find → preview → select → embed" processing step, the
hotlink-vs-self-host tradeoff, the rendering, and a phased rollout. Read the
**Decisions to make** section at the end first — most of the plan branches on
those three choices.

---

## Where we are today

- `/beautiful` is `src/content/docs/beautiful.md`, one curated markdown file
  rendered by `src/components/CategoryDoc.astro` inside `.essay-body`. Entries
  are `[Title](url)` + a caption paragraph. (One entry so far: Hubble UDF.)
- Curated content is "one editable file per category" by convention
  (`docs/*.md`, `books.yaml`). Streaming/machine content is per-file
  (`notes/`, `articles/`).
- **We already hotlink external images and it works.** `books.yaml` carries a
  `cover:` field that is "a live cover URL from an Amazon/Goodreads CDN (never
  self-hosted)". `BookRow.astro` renders it as:
  ```html
  <img src={cover} alt="" loading="lazy" onerror="this.remove()" />
  ```
  That pattern — hotlink, lazy-load, drop silently on error — is the precedent
  to build on. The global stylesheet already has `img { max-width:100%; height:auto }`.
- Capture already stores, per link, both `url` and `archive`
  (`https://web.archive.org/web/2/<url>`) and fires a Wayback save. So every
  beautiful item already has an archival URL we can fall back to.
- The site is static Astro on Cloudflare Pages. Owner-only write endpoints
  (e.g. `functions/api/books.js`) sit behind Cloudflare Access and authenticate
  via the Access JWT. Any owner-mode preview UI should reuse that, not a typed
  token.

---

## The shape of the problem

A "beautiful thing" is usually one of:

1. **A page whose subject is a single image** (ESA/Hubble, APOD, a museum object
   page, a Wikimedia file page, an artist's post). We want *that* image.
2. **An article/thread that contains a striking image** among others. We want to
   pick the *right* one, not the first `<img>` or a logo/avatar.
3. **A direct image URL** already (`…/foo.jpg`). Nothing to extract.

So the processing step is really: *given a source URL, produce a small set of
candidate image URLs, let me eyeball them, and record the one I pick.* Blind
OG-image scraping gets case 1 right and case 2 wrong, which is exactly why the
user asked for a **preview + select** step rather than full automation.

---

## 1. Data model

**Recommendation: promote `beautiful` from a markdown doc to a YAML collection,
mirroring `books.yaml`.** A gallery is structured, repeating records with an
image + caption + credit + source — the same reasons books is YAML apply here,
and it makes the render loop, the preview tool, and an eventual owner-mode
editor all trivial. The markdown doc's freeform prose isn't buying us anything
once every entry is image + caption.

`src/content/beautiful.yaml`:

```yaml
- id: hubble-udf                      # unique, stable slug (like books ids)
  title: Hubble Ultra Deep Field
  source: https://esahubble.org/images/heic0611b/   # the page to link out to
  image: https://cdn.esahubble.org/.../heic0611b.jpg # the URL we actually <img>
  # optional:
  thumb: https://cdn.esahubble.org/.../heic0611b_screen.jpg  # smaller for grid
  credit: NASA, ESA, S. Beckwith (STScI) and the HUDF Team
  caption: >
    Ten thousand galaxies in a patch of sky the size of a grain of sand at
    arm's length.
  archive: https://web.archive.org/web/2/https://esahubble.org/images/heic0611b/
  selfhost: false                     # true once we've copied it into public/media
  added: 2026-07-10
```

Add a collection to `src/content.config.ts` using the same `file()` + YAML
parser as `books`/`drafts`:

```ts
const beautiful = defineCollection({
  loader: file('src/content/beautiful.yaml', { parser: yamlParser }),
  schema: z.object({
    title: z.string(),
    source: z.string().url(),
    image: z.string().url(),
    thumb: z.string().url().optional(),
    credit: z.string().optional(),
    caption: z.string().optional(),
    archive: z.string().url().optional(),
    selfhost: z.boolean().default(false),
    added: z.coerce.date(),
    draft: z.boolean().default(false),
  }),
});
```

**Alternative (lower effort, less clean): keep `beautiful.md`** and embed a
figure per entry:

```html
<figure>
  <a href="SOURCE"><img src="IMAGE" alt="TITLE" loading="lazy"></a>
  <figcaption>CAPTION — <a href="SOURCE">source</a></figcaption>
</figure>
```

This works today with zero schema changes and keeps the doc-editor flow, but
you lose grid layout, per-field validation, and easy programmatic editing. Pick
this only if you want images *this week* and don't want to touch the schema.

The rest of this doc assumes the YAML collection.

---

## 2. The processing step (find → preview → select)

A new script, `scripts/extract-images.mjs`, run by the owner (not in CI). Two
modes:

### a. Candidate extraction

Input: a source URL (or an inbox note tagged `beautiful`). Output: an ordered
list of candidate image URLs with dimensions.

Extraction order, best signal first:

1. **Direct image** — if the URL's content-type is `image/*`, it *is* the image.
2. **Known-source rules** — small table of per-host resolvers for the sources
   that recur: ESA/Hubble (`cdn.esahubble.org`), NASA APOD, Wikimedia Commons
   (`Special:FilePath` / the `imageinfo` API for full-res), museum IIIF
   endpoints, Flickr sizes. These give the *full-res original*, which OG tags
   usually don't.
3. **oEmbed** — if the host advertises an oEmbed endpoint (Flickr, many CMSes),
   use its `url`/`thumbnail_url`.
4. **Metadata tags** — `og:image` / `og:image:secure_url`, `twitter:image`,
   `<link rel="image_src">`, JSON-LD `image`. Usually correct for
   single-image pages (case 1).
5. **In-body `<img>` sweep** — collect `<img>`/`<source srcset>`, resolve
   relative URLs, drop anything that smells like chrome (width/height < ~200px,
   or url matches `avatar|logo|icon|sprite|spinner|1x1|pixel`). Prefer the
   largest by intrinsic or `srcset`-declared size. This is what saves case 2.

For each candidate capture: absolute URL, pixel dimensions (from `srcset`
descriptors, HTML attrs, or a `HEAD`/range fetch), byte size, and content-type.
Require `https`. De-dupe by normalized URL.

Fetching: plain `fetch` with a real User-Agent; parse HTML with the `linkedom`
or `node-html-parser` package (lightweight, already the kind of dep this repo
tolerates). No headless browser unless a source truly needs JS — keep it a CLI,
not Puppeteer, for v1.

### b. Preview + select

Blind scraping is the thing to avoid, so the human step is the point. Two ways
to surface candidates, cheapest first:

- **Contact sheet (v1).** The script writes a throwaway
  `scratch/beautiful-preview.html` that lays out every candidate as a thumbnail
  with its dimensions/size and a radio button, and prints the path. Open it,
  click the winner, hit "emit", and the page copies a ready-to-paste YAML block
  (or the script watches for the choice). No server, no auth — just a local
  file. This is the fastest thing to build and matches "images previewed, then
  selected".
- **Owner-mode picker (v2).** A `/beautiful` in `DRAFTS=1` mode gets an "add"
  box: paste a URL → a `functions/api/beautiful-candidates.js` Pages Function
  runs the extractor server-side and returns candidates → you click one → a
  `functions/api/beautiful.js` write endpoint appends the entry to
  `beautiful.yaml` and commits (exactly like `books.js`, same Cloudflare Access
  auth, same commit-queue). This is the "nice" version and the natural home once
  v1 proves the extraction rules.

Either way the output is a validated YAML entry appended to `beautiful.yaml`.

### c. Where it plugs into the existing flow

Beautiful items arrive as captured notes and are filed by the `process-inbox`
skill. Extend that path: when an inbox note is destined for beautiful, run the
extractor, preview, pick, and write the `beautiful.yaml` row instead of a
markdown link (then delete the note, as the skill already does). Until the
owner-mode picker exists, `process-inbox` can call `extract-images.mjs` and drop
the candidate contact-sheet path in its report for you to resolve.

---

## 3. Hotlink vs. self-host

The one real infrastructure decision. Three tiers, and the recommendation is to
support all three with a sensible default.

| | Hotlink (default) | Self-host in `public/media/beautiful/` |
|---|---|---|
| Storage / repo size | none | grows with each image |
| Reliability | breaks on link rot, hotlink blocking, CDN changes | rock-solid |
| Rights | linking, not redistributing | you're now redistributing — matters for some sources |
| Layout | must guess dimensions | you control size, can pre-optimize |
| Consistency w/ repo | matches `books.yaml` covers exactly | new pattern |

**Recommendation: hotlink by default (consistent with book covers), with an
opt-in self-host escape hatch.** Concretely:

- Default `selfhost: false` → render `<img src={image}>` with the
  `onerror` fallback (below). Zero storage, same as covers.
- During preview, the extractor does a `HEAD`/range fetch to detect hotlink
  protection (403/hotlink-referrer redirects) and layout hazards. If a source is
  flagged fragile, it recommends self-hosting.
- `selfhost: true` → a `scripts/fetch-image.mjs` step downloads the chosen
  image, optimizes it (resize to a max width ~1600px, strip EXIF, emit
  `.avif`/`.webp` + a `.jpg` fallback via `sharp`), writes it to
  `public/media/beautiful/<id>.<ext>`, and rewrites `image:`/`thumb:` to the
  local path. `public/media/` is already the home for pipeline-produced media
  (audio), so this fits.

Rule of thumb baked into the tool: **hotlink museum/observatory/Wikimedia CDNs
(stable, link-friendly); self-host social/blog images (rot-prone, hotlink-hostile).**
Regardless of tier, keep `source:` and `archive:` so a dead image still has a
path back to the original.

---

## 4. Rendering

New `src/pages/beautiful.astro` (replacing the `CategoryDoc` passthrough) +
a small `BeautifulItem.astro`, or inline. A responsive gallery:

- **Layout:** CSS columns masonry (`columns: 1 / 2 / 3` by breakpoint) or a
  simple single-column stack of large figures. Given the reading-column site
  design, I'd start single-column, full-width figures — it reads as a considered
  gallery, not a Pinterest wall. Easy to switch to columns later.
- **Figure:**
  ```html
  <figure class="beautiful">
    <a href={source}>
      <img src={thumb ?? image} alt={title}
           loading="lazy" decoding="async"
           width={w} height={h}            <!-- reserve space, kill layout shift -->
           onerror="this.closest('figure').classList.add('img-broken')" />
    </a>
    <figcaption>
      <span class="b-title">{title}</span>
      {caption && <span class="b-caption">{caption}</span>}
      {credit && <span class="b-credit">{credit}</span>}
      <a class="b-source" href={source}>source ↗</a>
    </figcaption>
  </figure>
  ```
- **Broken-image fallback:** the `onerror` adds `.img-broken` to the figure;
  CSS hides the `<img>` and shows the title as a plain link. This is the
  degrade-gracefully version of the books `onerror="this.remove()"` — here we
  keep the caption/link so the entry isn't lost. (For hotlinked images this
  *will* happen eventually; design for it.)
- **Layout shift:** always store/emit `width`/`height` (or an `aspect-ratio`)
  from the extractor so the box is reserved before the image loads.
- **Full-res on click:** the figure links to `source` by default. Optionally a
  lightbox later; not needed for v1.
- **CSS:** add a `.beautiful`/`figure`/`figcaption` block to `global.css`
  (there's a slot for it near the `.quote-src` section). Theme-aware via the
  existing `--fg`/`--muted`/`--border` vars.

---

## 5. Failure modes to design around

- **Link rot / hotlink blocking** → `onerror` fallback + `source`/`archive`
  retained; self-host escape hatch for known-fragile hosts.
- **Mixed content** → require `https` image URLs in the schema/extractor.
- **Layout shift** → mandatory dimensions.
- **Wrong image picked** → the whole point of the preview step; never auto-embed
  without a human pick.
- **Huge originals** (Hubble TIFFs are enormous) → prefer a CDN "screen"/"large"
  derivative for `image`, keep the full-res only behind the `source` link;
  self-host path resizes.
- **NSFW/unexpected content from `<img>` sweep** → preview catches it.

---

## 6. Phased rollout

1. **Phase 0 — render support (small).** Add the `beautiful` YAML collection +
   schema, `beautiful.astro` gallery, and CSS. Hand-write 2–3 entries
   (Hubble + whatever's queued) to prove the look. Ship. Everything after this
   is tooling; the site already shows images.
2. **Phase 1 — extractor CLI + contact sheet.** `scripts/extract-images.mjs`
   with the resolver table + metadata/`<img>` sweep, emitting the local preview
   HTML and a paste-ready YAML block. This is the "find → preview → select"
   core, no server needed.
3. **Phase 2 — self-host tool.** `scripts/fetch-image.mjs` (`sharp` optimize →
   `public/media/beautiful/`), driven by `selfhost: true`.
4. **Phase 3 — process-inbox integration.** Route `beautiful`-bound notes
   through the extractor in the skill.
5. **Phase 4 — owner-mode picker.** `beautiful-candidates.js` +
   `beautiful.js` Pages Functions behind Cloudflare Access; add-a-URL box on the
   `DRAFTS=1` page. The polished path; only worth it if the CLI proves annoying.

Stop after any phase and still have a working, better page.

---

## Decisions to make (these drive the rest)

1. **Data model:** promote to `beautiful.yaml` (recommended) or keep
   `beautiful.md` with embedded figures?
2. **Storage default:** hotlink-first with self-host escape hatch (recommended),
   or self-host everything for durability, or hotlink-only for simplicity?
3. **Preview surface for v1:** local contact-sheet HTML (recommended, fastest)
   or go straight to the owner-mode picker?

Everything else (extraction rules, rendering, fallbacks) follows from these and
can be built incrementally.
