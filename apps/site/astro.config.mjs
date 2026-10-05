// @ts-check
import { defineConfig } from 'astro/config';

// Static site on Cloudflare Pages (project `onlyswap-site`, P13-WEB-01).
// Dynamic share and invite pages (/l, /m, /i) are Pages Functions in ./functions.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://onlyswap.pages.dev',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  // Scripts ship as files so the CSP can stay script-src 'self' (P13-WEB-09).
  vite: { build: { assetsInlineLimit: 0 } },
});
