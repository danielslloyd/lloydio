// Shared logic for the article reading list. The /reading page and the
// /api/podcast-queue.json endpoint both use this, so the human view and
// the machine view (what BacklogCast consumes) can never disagree.

import { getCollection } from 'astro:content';
import { SHOW_DRAFTS } from './site';

export interface ReadingItem {
  slug: string;
  title: string;
  url: string;
  date: Date;
  tags: string[];
  status: 'queued' | 'ready' | 'read';
  audio?: string;
  hasArticle: boolean;
  articlePath: string; // repo path where the article file lives / should live
  articleFilePath?: string; // actual path if the article exists
}

// Deterministic slug for an article: from the title (or URL hostname),
// suffixed with a short hash of the URL so retitling can't collide.
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

// Union of: existing article entries + podcast-flagged notes that don't
// have an article yet (matched by URL). Newest first.
export async function getReadingItems(): Promise<ReadingItem[]> {
  const articles = await getCollection('articles', (e) => SHOW_DRAFTS || !e.data.draft);
  const notes = await getCollection(
    'notes',
    (e) => e.data.tags.includes('podcast') && !!e.data.url && (SHOW_DRAFTS || !e.data.draft)
  );

  const items: ReadingItem[] = articles.map((a) => ({
    slug: articleSlug(a.data.title, a.data.url),
    title: a.data.title,
    url: a.data.url,
    date: a.data.date,
    tags: a.data.tags,
    status: a.data.status,
    audio: a.data.audio,
    hasArticle: true,
    articlePath: a.filePath ?? `src/content/articles/${a.id}.md`,
    articleFilePath: a.filePath,
  }));

  const knownUrls = new Set(items.map((i) => i.url));
  for (const n of notes) {
    if (knownUrls.has(n.data.url!)) continue;
    const slug = articleSlug(n.data.title, n.data.url!);
    items.push({
      slug,
      title: n.data.title ?? n.data.url!,
      url: n.data.url!,
      date: n.data.date,
      tags: n.data.tags.filter((t) => t !== 'podcast'),
      status: 'queued',
      hasArticle: false,
      articlePath: `src/content/articles/${slug}.md`,
    });
  }

  return items.sort((a, b) => b.date.valueOf() - a.date.valueOf());
}
