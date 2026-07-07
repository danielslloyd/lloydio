import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const essays = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/essays' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

// One file per captured link/note. The capture endpoint and the Keep
// ingester write these; you can also create them by hand.
//
// Lifecycle: items arrive with `inbox: true` and get processed by the
// `process-inbox` skill (categorized via tags, cleaned up, inbox flag
// removed). Category tags with top-level pages: books, commonplace,
// beautiful, infographics. The `podcast` tag flags a link for BacklogCast.
const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
  schema: z.object({
    title: z.string().optional(),
    url: z.string().url().optional(),
    archive: z.string().url().optional(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    inbox: z.boolean().default(false),
    source: z.string().optional(), // 'capture' | 'keep' | 'manual'
  }),
});

// The article reading list. Stubs are created from podcast-flagged notes;
// BacklogCast fills in the body (clean markdown of the article text) and
// the `audio` URL when it generates an episode. See docs/BACKLOGCAST.md.
const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    url: z.string().url(),
    date: z.coerce.date(),
    audio: z.string().optional(), // relative (/media/audio/…) or absolute URL
    status: z.enum(['queued', 'ready', 'read']).default('queued'),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

// The book reading list, fed by the process-inbox skill when notes
// mention books. Body = personal notes on the book.
const books = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/books' }),
  schema: z.object({
    title: z.string(),
    author: z.string().optional(),
    date: z.coerce.date(), // when added
    status: z.enum(['to-read', 'reading', 'finished']).default('to-read'),
    links: z
      .object({
        amazon: z.string().url().optional(),
        audible: z.string().url().optional(),
        goodreads: z.string().url().optional(),
      })
      .default({}),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { essays, notes, articles, books };
