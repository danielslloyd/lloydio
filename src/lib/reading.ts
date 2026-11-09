// Shared logic for the article reading list. The /feed page and the
// /api/podcast-queue.json endpoint both use this, so the human view and
// the machine view (what BacklogCast consumes) can never disagree.

import { getCollection } from 'astro:content';
import { SHOW_DRAFTS, PUBLIC_ORIGIN } from './site';

// Listen state, from the repo alone: `ready` = narrated (article has audio),
// `queued` = note tagged `podcast` (BacklogCast will narrate it), `none` =
// reading only. "In progress" is live state BacklogCast reports to
// /api/episode-status; the owner page overlays it client-side.
export type ListenState = 'none' | 'queued' | 'ready';

export interface ReadingItem {
  slug: string; // /feed/<slug> page (derived from the article title)
  // Stable id BacklogCast tracks the item by: the queue slug and the live-status
  // key. It is the article's filename once the clean text exists.
  key: string;
  title: string;
  url: string;
  date: Date;
  tags: string[];
  status: 'queued' | 'ready' | 'read';
  listen: ListenState;
  read: boolean; // finished: article `status: read`, or the note tagged `read`
  audio?: string;
  audioBytes?: number; // mp3 size in R2 (counts toward the storage limit)
  duration?: number; // seconds
  feedDate?: Date; // the episode's pubDate in the podcast feed
  hasArticle: boolean;
  draft: boolean; // owner-only (article or note is draft: true)
  articleDraft: boolean; // the article itself is a draft — left out of the podcast feed
  articlePath: string; // repo path where the article file lives / should live
  articleFilePath?: string; // actual path if the article exists
  notePath?: string; // the reading/podcast note for this URL, if any
}

// Tags that put a note on the reading list.
export const READING_TAG = 'reading';
export const PODCAST_TAG = 'podcast';
// Marks a link as read on its note (for links without an article yet; once
// the article exists its `status: read` says the same — /api/reading sets both).
export const READ_TAG = 'read';

// Deterministic slug for an article: from the title (or URL hostname),
// suffixed with a short hash of the URL so retitling can't collide.
// Duplicated in pipeline/backlogcast.mjs and functions/_episodes.js.
// What the episode mp3s can occupy in R2 before storage is billed: the free
// tier is 10 GB-month (decimal GB, the conservative reading).
export const FEED_STORAGE_LIMIT = 10e9;

// The public podcast feed (see src/pages/podcast/[token].xml.ts). The owner
// build shows the public URL too, so it needs the same FEED_TOKEN to be right.
export const FEED_URL = `${PUBLIC_ORIGIN}/podcast/${process.env.FEED_TOKEN || 'feed'}.xml`;

export function fmtBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  return `${(b / 1e6).toFixed(b >= 1e8 ? 0 : 1)} MB`;
}

// Seconds → m:ss or h:mm:ss.
export function fmtLength(s?: number): string {
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(Math.round(s % 60)).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

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
// Drafts are included in owner builds, or when `includeDrafts` is set (the
// podcast queue, which still only lists the drafts queued for narration).
export async function getReadingItems(
  { includeDrafts = false }: { includeDrafts?: boolean } = {}
): Promise<ReadingItem[]> {
  const withDrafts = SHOW_DRAFTS || includeDrafts;
  const articles = await getCollection('articles', (e) => withDrafts || !e.data.draft);
  const notes = await getCollection(
    'notes',
    (e) =>
      (e.data.tags.includes(PODCAST_TAG) || e.data.tags.includes(READING_TAG)) &&
      !!e.data.url &&
      (withDrafts || !e.data.draft)
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
      read: a.data.status === 'read' || Boolean(note?.data.tags.includes(READ_TAG)),
      audio: a.data.audio,
      audioBytes: a.data.audio_bytes,
      duration: a.data.duration,
      feedDate: a.data.audio ? (a.data.feed_date ?? a.data.date) : undefined,
      hasArticle: true,
      draft: a.data.draft || Boolean(note?.data.draft),
      articleDraft: a.data.draft,
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
      tags: n.data.tags.filter((t) => t !== PODCAST_TAG && t !== READING_TAG && t !== READ_TAG),
      status: n.data.tags.includes(READ_TAG) ? 'read' : 'queued',
      listen: n.data.tags.includes(PODCAST_TAG) ? 'queued' : 'none',
      read: n.data.tags.includes(READ_TAG),
      hasArticle: false,
      draft: n.data.draft,
      articleDraft: false,
      articlePath: `src/content/articles/${slug}.md`,
      notePath: n.filePath,
    });
  }

  return items.sort((a, b) => b.date.valueOf() - a.date.valueOf());
}
