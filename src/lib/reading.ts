// Shared logic for the article reading list. The /reading page and the
// /api/podcast-queue.json endpoint both use this, so the human view and
// the machine view (what BacklogCast consumes) can never disagree.

import { getCollection } from 'astro:content';
import { SHOW_DRAFTS } from './site';

// Listen state, from the repo alone: `ready` = narrated (article has audio),
// `queued` = note tagged `podcast` (BacklogCast will narrate it), `none` =
// reading only. "In progress" is live state BacklogCast reports to
// /api/episode-status; the owner page overlays it client-side.
export type ListenState = 'none' | 'queued' | 'ready';

export interface ReadingItem {
  slug: string; // /reading/<slug> page (derived from the article title)
  // Stable id BacklogCast tracks the item by: the queue slug and the live-status
  // key. It is the article's filename once the clean text exists.
  key: string;
  title: string;
  url: string;
  date: Date;
  tags: string[];
  status: 'queued' | 'ready' | 'read';
  listen: ListenState;
  audio?: string;
  hasArticle: boolean;
  articlePath: string; // repo path where the article file lives / should live
  articleFilePath?: string; // actual path if the article exists
  notePath?: string; // the reading/podcast note for this URL, if any
}

// Tags that put a note on the reading list.
export const READING_TAG = 'reading';
export const PODCAST_TAG = 'podcast';

// Deterministic slug for an article: from the title (or URL hostname),
// suffixed with a short hash of the URL so retitling can't collide.
// Duplicated in pipeline/backlogcast.mjs and functions/_episodes.js.
export function articleSlug(title: string | undefined, url: string): string {
  const base =
    (title || new URL(url).hostname + new URL(url).pathname)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'article';
  return `${base}-${fnv1a(url)}`;
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 6);
}

// Union of: existing article entries + reading/podcast-tagged notes that
// don't have an article yet (matched by URL). Newest first.
export async function getReadingItems(): Promise<ReadingItem[]> {
  const articles = await getCollection('articles', (e) => SHOW_DRAFTS || !e.data.draft);
  const notes = await getCollection(
    'notes',
    (e) =>
      (e.data.tags.includes(PODCAST_TAG) || e.data.tags.includes(READING_TAG)) &&
      !!e.data.url &&
      (SHOW_DRAFTS || !e.data.draft)
  );
  const noteByUrl = new Map(notes.map((n) => [n.data.url!, n]));

  const items: ReadingItem[] = articles.map((a) => {
    const note = noteByUrl.get(a.data.url);
    return {
      slug: articleSlug(a.data.title, a.data.url),
      key: a.id,
      title: a.data.title,
      url: a.data.url,
      date: a.data.date,
      tags: a.data.tags,
      status: a.data.status,
      // Text can exist without audio; narration is wanted only while the note
      // carries the `podcast` tag.
      listen: a.data.audio ? 'ready' : note?.data.tags.includes(PODCAST_TAG) ? 'queued' : 'none',
      audio: a.data.audio,
      hasArticle: true,
      articlePath: a.filePath ?? `src/content/articles/${a.id}.md`,
      articleFilePath: a.filePath,
      notePath: note?.filePath,
    };
  });

  const knownUrls = new Set(items.map((i) => i.url));
  for (const n of notes) {
    if (knownUrls.has(n.data.url!)) continue;
    const slug = articleSlug(n.data.title, n.data.url!);
    items.push({
      slug,
      key: slug,
      title: n.data.title ?? n.data.url!,
      url: n.data.url!,
      date: n.data.date,
      tags: n.data.tags.filter((t) => t !== PODCAST_TAG && t !== READING_TAG),
      status: 'queued',
      listen: n.data.tags.includes(PODCAST_TAG) ? 'queued' : 'none',
      hasArticle: false,
      articlePath: `src/content/articles/${slug}.md`,
      notePath: n.filePath,
    });
  }

  return items.sort((a, b) => b.date.valueOf() - a.date.valueOf());
}
