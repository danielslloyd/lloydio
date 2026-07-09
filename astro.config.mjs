// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from "@astrojs/cloudflare";

// Set this to your real domain once you have one.
export default defineConfig({
  site: 'https://lloydio.pages.dev',
  trailingSlash: 'never',

  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },

  adapter: cloudflare()
});