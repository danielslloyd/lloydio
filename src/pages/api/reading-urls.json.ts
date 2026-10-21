// Every URL on the reading list (articles + podcast-queued notes), built
// statically on each deploy: GET /api/reading-urls.json. /api/reading uses it
// to reject a link that's already queued or narrated.
import type { APIRoute } from 'astro';
import { getReadingItems } from '../../lib/reading';

export const GET: APIRoute = async () => {
  const items = await getReadingItems();
  const body = { urls: items.map((i) => ({ url: i.url, title: i.title, status: i.status })) };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
};
