---
name: cite-quote
description: Turn a quote into a paste-ready entry for Daniel's quotes page (lloydio `src/content/docs/quotes.md`) — check the wording and attribution against real sources, find the author when none is given, flag misattributions, and write the fullest citation the evidence supports, in the page's markdown + HTML format. Use this whenever the user pastes a quote, line, passage or aphorism and wants it cited, attributed, fact-checked, "cleaned up", or formatted "for the quotes page" — and for "who said this?" questions about a quote they want to keep — even if they just paste the quote with a word like "cite" or "quote page".
---

# Cite a quote for the quotes page

The quotes page (`/quotes`, source `src/content/docs/quotes.md`) is meant to be
trustworthy: every entry should say who really said it, in their words, with
enough of a citation that a reader could find the passage. Famous lines drift —
they get polished, shortened, and pinned on more famous names (Twain, Lincoln,
Einstein, Churchill, C. S. Lewis, Chesterton, the Buddha). The job is a quick
but real check, then a clean, paste-ready block.

The deliverable is two things: the **block** (in a fenced code block so it
copies cleanly) and a short **check report** saying what was verified and how.

## 1. Read the input

Pull out: the quote text, the attribution given (if any), any source or link,
and any context ("from a podcast", "my pastor said"). Note what's claimed and
what's missing — those are what the research has to settle.

## 2. Research — proportionate, but real

Aim to establish three things: **who** actually said or wrote it, the **exact
original wording**, and the **earliest or primary source** with as much detail
as exists (title, publication, date, page/chapter/timestamp, URL).

Work roughly in this order, stopping once you've seen the primary source:

1. **A link or source was given** → open it. Confirm the passage is there and
   matches; take the author, title, publication and date from the page itself.
2. **Exact-phrase search** on a distinctive 5–10 word chunk (in quotes). Try a
   second chunk if the first is a common phrase or the wording may have drifted.
3. **Famous or aphoristic lines** → check Quote Investigator
   (quoteinvestigator.com) and Wikiquote, including its "Disputed" and
   "Misattributed" sections. These are the best evidence for misattribution;
   follow their citations rather than stopping at them.
4. **Primary text** → for books, letters, speeches and sermons, find the
   passage itself: Google Books, Internet Archive, Project Gutenberg,
   Wikisource, the publisher's or periodical's own archive. This is where page
   numbers, chapters, editions and dates come from.
5. **Recent articles, posts, podcasts** → the original page (not an
   aggregator or a quote site); for podcasts/videos, the episode page and the
   timestamp if a transcript shows it.

Quote-aggregator sites (BrainyQuote, Goodreads quotes, AZQuotes, Pinterest
images) are not evidence on their own: they're where misattributions spread.

**Never invent a detail.** No guessed page numbers, dates, editions or URLs.
A detail you couldn't confirm is left out of the citation — a shorter citation
that's true beats a thorough one that isn't — and named in the report.

## 3. Decide the attribution

- **Verified** — you saw the words in the primary source (or a faithful scan
  or transcript of it). Cite it fully.
- **Likely** — no primary source in reach, but a reliable secondary one (a
  scholarly citation, Quote Investigator's research, a reputable quotation
  dictionary) settles it. Cite the original as far as that source documents
  it, and say in the report that the primary text wasn't seen.
- **Misattributed** — the line really comes from someone else. Credit the
  real originator and keep the popular name as a note:
  `(often attributed to Plato)`.
- **Unverified** — no reliable source either way. Keep the name the user gave,
  hedged: `— attributed to Name` (or `— often attributed to Name` when the
  attribution is widespread).
- **Proverb / folk saying** — `— Italian proverb`, `— Chinese proverb` — but
  only when sources treat it as one; a "Chinese proverb" first seen in a 1980s
  self-help book is a misattribution.
- **No author given** — find one. If several people claim it, credit the
  earliest documented use and mention the others in the report.

**Wording.** Use the original wording from the source, keeping the user's
excerpt boundaries. Mark cuts with `…`. If the user's version is a popular
paraphrase, still use the original and show the difference in the report —
the page is for the real thing. When the popular form has drifted far enough
that a reader wouldn't recognize the original ("Be pitiful, for every man…" →
"Be kind, for everyone you meet…"), also name the popular form in the
citation so the entry is findable. If you never saw the primary text, keep the
user's wording unless a reliable source quotes the original verbatim. For
translations, use the translation the user gave (or a standard one) and name
the translator when known. Keep the source's spelling (British, archaic) as
is.

## 4. Format the block

Every entry is a blockquote, a blank line, a one-line HTML citation, a blank
line, and a `---` separator:

```markdown
> First paragraph of the quote.
>
> Second paragraph, if any.

<p class="quote-src">— CITATION</p>

---
```

Rules, and why:

- Every quote line starts with `> `; a blank line *between* paragraphs is a
  lone `>`, so the whole passage stays one blockquote.
- The citation is raw HTML — the markdown renderer does not process markdown
  inside it. So links are `<a>` tags, `&` becomes `&amp;` (in hrefs too), and
  no `*italics*` or `[links](…)`.
- Use typographic punctuation, as the rest of the page does: “double”,
  ‘single’, apostrophes ’, em dash —, ellipsis ….
- Work titles go in curly quotes. When there's a stable URL for the source,
  link the title itself: `“<a class="src-title" href="URL">Title</a>”`.
- When the only thing to link is a bare page (a podcast episode, a social
  post), add `<br>` and the URL on its own line inside the same `<p>`:
  `…, Mar 30, 2025<br>` ⏎ `<a href="URL">URL</a></p>`.
- For a web page where you confirmed the exact text, add a text fragment so
  the link jumps to the passage: `#:~:text=first%20few%20words,last%20few%20words`
  (URL-encoded; skip it for very short or repeated phrases).
- Order: Author[, descriptor or (tr. Translator)], “Title”, Publication or
  container, Date[, p./ch./timestamp][; context][ (attribution note)][; research
  link]. Dates as `Month D, YYYY` (`March 25, 2006`), or just the year when
  that's all that's known.
- When the attribution rests on someone's research rather than a source you
  could link directly (a misattributed or "likely" quote), end with a link to
  that research so a reader can check it:
  `; traced by <a href="URL">Quote Investigator</a>`.

Patterns by source type:

| source | citation (inside `<p class="quote-src">…</p>`) |
| --- | --- |
| article, blog, Substack | `— Author, “<a class="src-title" href="URL">Title</a>”, Publication, Month D, YYYY` |
| book | `— Author, “Title” (Year), p. 42` · translator: `— Author (tr. Name), “Title” (Year), ch. 8` · link the title to a page showing the passage (Google Books, Internet Archive, Gutenberg) when you found one |
| letter | `— Author, letter to Recipient, Month D, YYYY (in “Collection”, pp. 51–52)` |
| speech, sermon, lecture | `— Author, “Title” (sermon), Venue, Month D, YYYY` |
| podcast, video | `— Speaker, on Show Name (@01:32:56), Month D, YYYY<br>` + `<a href="URL">URL</a>` |
| social post, Substack note | `— Name (@handle), Platform, Month D, YYYY<br>` + `<a href="URL">URL</a>` |
| quoted secondhand | `— Original Author, “Original Work” (Year), quoted in Author, “<a class="src-title" href="URL">Title</a>”, Publication, Month D, YYYY` |
| misattributed | `— Real Author, “Source” (Year) (often attributed to Famous Name); traced by <a href="URL">Quote Investigator</a>` |
| unverified | `— attributed to Name` |
| proverb | `— Portuguese proverb` |

Entries in the target style (the first is straight from the page):

```markdown
> Practical men are no greater than their successes; idealists, however, may leave behind treasures for future generations, however contemporaries undervalue them.

<p class="quote-src">— John Byron Kuhner, “<a class="src-title" href="https://firstthings.com/the-savannah-enlightenment/#:~:text=men%20are%20no%20greater%20than%20their%20successes">The Savannah Enlightenment</a>”, First Things, April 21, 2026</p>

---
```

```markdown
> And if we obey God, we must disobey ourselves; and it is in disobeying ourselves, wherein the hardness of obeying God consists.

<p class="quote-src">— Herman Melville, Father Mapple’s sermon in “Moby-Dick” (1851), ch. 9</p>

---
```

A misattribution, given as “Be kind, for everyone you meet is fighting a hard
battle. — Plato”:

```markdown
> Be pitiful, for every man is fighting a hard battle.

<p class="quote-src">— Ian Maclaren (Rev. John Watson), Christmas message to the readers of “The British Weekly” (1897), reported in “The Congregationalist”, January 6, 1898 (popularized as “Be kind, for everyone you meet is fighting a hard battle”; often attributed to Plato); traced by <a href="https://quoteinvestigator.com/2010/06/29/be-kind/">Quote Investigator</a></p>

---
```

## 5. Reply

1. The block, in a ```` ```markdown ```` fence, ending with `---`. New
   entries go at the **top** of `quotes.md` (just under the frontmatter) —
   newest first — so say that's where to paste it.
2. A check report of a few bullets, outside the fence:
   - **Verdict** (verified / likely / misattributed / unverified / proverb) and
     how confident, in a phrase.
   - **Sources** actually consulted, as links.
   - **Wording changes** from what the user gave, if any.
   - **Left out** — details you couldn't confirm.

Keep the report short; the block is the product.

If you're working inside the lloydio repo and the user asks you to add the
quote rather than just format it, insert the block right after the
frontmatter of `src/content/docs/quotes.md` and run `npm run build` to check
it renders.
