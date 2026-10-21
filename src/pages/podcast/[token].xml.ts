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
      let length = a.data.audio_bytes ?? 0;
      if (!length && a.data.audio!.startsWith('/')) {
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
      <itunes:explicit>false</itunes:explicit>${
        a.data.duration ? `\n      <itunes:duration>${Math.round(a.data.duration)}</itunes:duration>` : ''
      }
    </item>`;
    })
    .join('\n');

  // Podcast apps (Pocket Casts, Apple) expect artwork, author, category and an
  // explicit flag on the channel; a feed without them can fail to subscribe.
  const selfUrl = new URL(context.url.pathname, site).href;
  const cover = new URL('/media/podcast-cover.png', site).href;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SITE_TITLE)} backlog</title>
    <link>${esc(new URL('/reading', site).href)}</link>
    <atom:link href="${esc(selfUrl)}" rel="self" type="application/rss+xml" />
    <description>Narrated versions of articles from the reading list.</description>
    <language>en</language>
    <itunes:author>Daniel Lloyd</itunes:author>
    <itunes:summary>Narrated versions of articles from the reading list.</itunes:summary>
    <itunes:image href="${esc(cover)}" />
    <image><url>${esc(cover)}</url><title>${esc(SITE_TITLE)} backlog</title><link>${esc(new URL('/reading', site).href)}</link></image>
    <itunes:category text="Education" />
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>
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
