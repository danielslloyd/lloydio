// Private podcast feed with audio enclosures, built statically.
//
// The feed URL is /podcast/<FEED_TOKEN>.xml — set FEED_TOKEN to a long
// random string in the (public) deployment's build environment so the
// URL is unguessable, then subscribe in any podcast app. Defaults to
// /podcast/feed.xml when FEED_TOKEN is unset (local dev).
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE_TITLE } from '../../lib/site';
import fs from 'node:fs';

export function getStaticPaths() {
  return [{ params: { token: process.env.FEED_TOKEN || 'feed' } }];
}

export const GET: APIRoute = async (context) => {
  const site = context.site ?? new URL('http://localhost:4321');
  const articles = (await getCollection('articles', (e) => Boolean(e.data.audio))).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf()
  );

  const items = articles
    .map((a) => {
      const audioUrl = new URL(a.data.audio!, site).href;
      let length = 0;
      if (a.data.audio!.startsWith('/')) {
        try {
          length = fs.statSync(`public${a.data.audio}`).size;
        } catch {}
      }
      const type = audioUrl.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
      return `    <item>
      <title>${esc(a.data.title)}</title>
      <link>${esc(a.data.url)}</link>
      <guid isPermaLink="false">${esc(audioUrl)}</guid>
      <pubDate>${a.data.date.toUTCString()}</pubDate>
      <description>${esc(`Narration of ${a.data.url}`)}</description>
      <enclosure url="${esc(audioUrl)}" length="${length}" type="${type}" />
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>${esc(SITE_TITLE)} backlog</title>
    <link>${esc(new URL('/reading', site).href)}</link>
    <description>Narrated versions of articles from the reading list.</description>
    <language>en</language>
    <itunes:block>Yes</itunes:block>
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml' } });
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
