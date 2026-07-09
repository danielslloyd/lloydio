import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';
import YAML from 'yaml';

// Explicit YAML parser so the file() loader works regardless of built-in
// format support. Each entry in the array must carry a unique `id`.
const yamlParser = (text: string) => YAML.parse(text);

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

// One file per captured link/note — the daily dump + one-offs. The capture
// endpoint and the Keep ingester write these; you can also create them by hand.
//
// Lifecycle: items arrive with `inbox: true`. The `process-inbox` skill triages
// them: curated items are appended to a category doc (`docs/*.md`), a row in
// `books.yaml`, or parked in `drafts.yaml`, and the note file is deleted;
// genuine one-offs stay here. The `podcast` tag flags a link for BacklogCast.
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

// The book reading list — one consolidated YAML file (edit/reorder in one
// place). Each entry needs a unique `id`. Fed by the process-inbox skill and
// by bulk goodreads imports.
const books = defineCollection({
  loader: file('src/content/books.yaml', { parser: yamlParser }),
  schema: z.object({
    title: z.string(),
    author: z.string().optional(),
    date: z.coerce.date(), // when added
    status: z.enum(['to-read', 'reading', 'finished']).default('to-read'),
    rating: z.number().min(0).max(5).optional(), // personal 1–5 stars; 0/undefined = unrated
    cover: z.string().url().optional(), // live cover URL from an Amazon/Goodreads CDN (never self-hosted)
    links: z
      .object({
        amazon: z.string().url().optional(),
        audible: z.string().url().optional(),
        goodreads: z.string().url().optional(),
      })
      .default({}),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    source: z.string().optional(), // 'goodreads' | 'manual'
  }),
});

// Curated single-file category docs (edit each as one document). Rendered
// with sidenotes/popups. Slugs: commonplace, beautiful, infographics.
const docs = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    blurb: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

// Owner-only triage bucket: discrete items pulled out of a category, waiting
// to be sorted/finished. Shown only in DRAFTS builds. One YAML file.
const drafts = defineCollection({
  loader: file('src/content/drafts.yaml', { parser: yamlParser }),
  schema: z.object({
    // `id` is promoted to the entry id by the loader, not part of `data`.
    category: z.string(),
    text: z.string(),
    note: z.string().optional(),
    source: z.string().optional(),
  }),
});

export const collections = { essays, notes, articles, books, docs, drafts };
