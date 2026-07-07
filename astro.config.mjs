// @ts-check
import { defineConfig } from 'astro/config';

// Set this to your real domain once you have one.
export default defineConfig({
  site: 'https://lloydio.pages.dev',
  trailingSlash: 'never',
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
});
