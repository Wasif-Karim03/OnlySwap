// Copies the shared tokens CSS to public/_tokens.css for the share pages, which
// Pages Functions render outside Astro (P13-WEB-06).
import { copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const src = require.resolve('@onlyswap/tokens/tokens.css');
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', '_tokens.css');
copyFileSync(src, out);
