// @ts-check
import { defineConfig } from 'astro/config';

// Static site on Cloudflare Pages (project `onlyswap-site`, P13-WEB-01).
// Dynamic share pages (/l, /m) are Pages Functions in ./functions.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://onlyswap.pages.dev',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
});
