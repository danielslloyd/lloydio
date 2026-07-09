// @ts-check
import { defineConfig } from 'astro/config';

// Production domain — RSS and podcast feed absolute URLs build from this.
export default defineConfig({
  site: 'https://lloyd.studio',
  trailingSlash: 'never',
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
});
