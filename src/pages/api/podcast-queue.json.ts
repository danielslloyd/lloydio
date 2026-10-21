// Machine-readable podcast queue for BacklogCast (or any other consumer).
// Built statically on every deploy: GET /api/podcast-queue.json
// Contract details: docs/BACKLOGCAST.md
import type { APIRoute } from 'astro';
import { getReadingItems } from '../../lib/reading';
import { REPO, REPO_BRANCH } from '../../lib/site';

export const GET: APIRoute = async () => {
  const items = await getReadingItems();
  const body = {
    version: 1,
    generated: new Date().toISOString(),
    repo: REPO,
    branch: REPO_BRANCH,
    write_back: {
      how: 'POST multipart to /api/episode (Bearer EPISODE_TOKEN): slug, title, url, date, duration_seconds, markdown, audio (mp3). Stores the mp3 in R2 and commits the article.',
      article_path: 'see items[].article_path — clean markdown + frontmatter (docs/BACKLOGCAST.md)',
      audio_options: [
        'POST to /api/episode (mp3 hosted on R2, absolute audio URL)',
        'or commit public/media/audio/<slug>.mp3 yourself and set frontmatter audio: /media/audio/<slug>.mp3',
      ],
    },
    items: items
      // Only items queued for narration; reading-list-only links stay out.
      .filter((i) => i.listen === 'queued')
      .map((i) => ({
        slug: i.slug,
        url: i.url,
        title: i.title,
        date: i.date.toISOString(),
        tags: i.tags,
        status: i.status,
        article_exists: i.hasArticle,
        has_audio: Boolean(i.audio),
        article_path: i.articlePath,
        suggested_audio_repo_path: `public/media/audio/${i.slug}.mp3`,
        suggested_audio_url: `/media/audio/${i.slug}.mp3`,
      })),
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};
