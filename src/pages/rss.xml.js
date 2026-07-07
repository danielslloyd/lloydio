import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE_TITLE, SITE_DESCRIPTION } from '../lib/site';

export async function GET(context) {
  // Drafts are never in the feed, even on the owner-mode deployment.
  const essays = await getCollection('essays', (e) => !e.data.draft);
  const notes = await getCollection('notes', (e) => !e.data.draft);

  const items = [
    ...essays.map((e) => ({
      title: e.data.title,
      pubDate: e.data.date,
      description: e.data.description ?? '',
      link: `/essays/${e.id}`,
    })),
    ...notes.map((n) => ({
      title: n.data.title ?? n.data.url ?? 'note',
      pubDate: n.data.date,
      description: n.body ?? '',
      link: n.data.url ?? `/notes#${n.id}`,
    })),
  ]
    .sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf())
    .slice(0, 50);

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site,
    items,
  });
}
