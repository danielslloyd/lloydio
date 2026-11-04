// Machine-readable work queue for BacklogCast (or any other consumer).
// Built statically on every deploy: GET /api/podcast-queue.json
// Contract details: docs/BACKLOGCAST.md
//
// Two kinds of work, which BacklogCast does in this order:
//   needs_text  — no clean text yet (every reading-list link gets one)
//   needs_audio — queued for narration (note tagged `podcast`, no audio yet)
//
// Drafts (owner-only items) are listed only once they're queued for narration,
// so queueing one is what exposes its title and URL here — the same facts the
// private feed carries once it's narrated. Items whose text already exists
// carry `article_raw_url`, so BacklogCast narrates that text instead of
// re-fetching the source (which may be paywalled, e.g. an emailed newsletter).
import type { APIRoute } from 'astro';
import { getReadingItems } from '../../lib/reading';
import { REPO, REPO_BRANCH, SHOW_DRAFTS } from '../../lib/site';

const rawUrl = (path: string) => `https://raw.githubusercontent.com/${REPO}/${REPO_BRANCH}/${path}`;

export const GET: APIRoute = async () => {
  const items = (await getReadingItems({ includeDrafts: true })).filter(
    (i) => SHOW_DRAFTS || !i.draft || i.listen === 'queued'
  );
  const body = {
    version: 2,
    generated: new Date().toISOString(),
    repo: REPO,
    branch: REPO_BRANCH,
    write_back: {
      how: 'POST multipart to /api/episode (Bearer EPISODE_TOKEN): slug, title, url, date, markdown, and — for narration — duration_seconds + audio (mp3). Without audio it commits the clean text only.',
      article_path: 'see items[].article_path — clean markdown + frontmatter (docs/BACKLOGCAST.md)',
    },
    items: items
      .filter((i) => !i.hasArticle || i.listen === 'queued')
      .map((i) => ({
        slug: i.key,
        url: i.url,
        title: i.title,
        date: i.date.toISOString(),
        tags: i.tags,
        status: i.status,
        needs_text: !i.hasArticle,
        needs_audio: i.listen === 'queued',
        article_exists: i.hasArticle,
        has_audio: Boolean(i.audio),
        article_path: i.articlePath,
        ...(i.hasArticle ? { article_raw_url: rawUrl(i.articlePath) } : {}),
        draft: i.draft,
      })),
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};
