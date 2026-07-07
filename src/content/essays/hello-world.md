---
title: "Hello, World"
date: 2026-07-07
description: "A demo page exercising every feature of this site."
tags: [meta]
---

This site borrows its reading experience from [gwern.net](https://gwern.net/design):
monochrome serif typography, sidenotes, hover previews, and collapsible
sections — without the thousand-hour maintenance budget. This page exists to
demonstrate (and test) each feature.

## Sidenotes

Footnotes like this one[^1] appear in the right margin when your window is
wide enough, and as ordinary footnotes at the bottom on narrow screens. Hover
over the footnote marker to get a popup preview[^2] instead of jumping.

[^1]: This is a sidenote. On a wide screen it sits in the margin, aligned
    with the sentence that references it.

[^2]: Popups also work for internal links — hover any link to another page
    on this site and you'll see an excerpt.

## Link previews

Hovering an internal link, like this one to the [notes page](/notes), fetches
the target and shows the first few paragraphs in a popup. External links are
left alone.

## Collapsible sections

<details>
<summary>Details you can hide</summary>

Anything can go in here — long asides, raw data, digressions. It's a native
`<details>` element, so it works with JavaScript disabled.

</details>

## Media

Audio files live in `public/media/` and embed with a plain HTML tag:

```html
<audio controls src="/media/example.mp3"></audio>
```

## Code

```python
def pomodoro(minutes: int = 25) -> None:
    """The site also hosts small apps — see /apps."""
    ...
```
