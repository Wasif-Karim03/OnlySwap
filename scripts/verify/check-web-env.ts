#!/usr/bin/env node
// Web export preflight (IR4-04, IR5-02). `pnpm export:web` runs this before
// `expo export -p web`: a static export never runs the app, so a bundle
// built without EXPO_PUBLIC_TURNSTILE_SITE_KEY would only fail in every
// visitor's browser. The env is loaded the way `expo export` loads it
// (NODE_ENV=production, then .env.production.local, .env.local,
// .env.production, .env; the process env wins; EXPO_NO_DOTENV=1 skips files)
// and checked with the app's own parseEnv(..., 'web'). Values are never printed.
//
// Usage:
//   node --experimental-strip-types scripts/verify/check-web-env.ts [--app apps/mobile]
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EnvError, parseEnv } from '../../apps/mobile/src/lib/env.ts';

type ExpoEnv = {
  setNodeEnv: (mode: 'production') => unknown;
  loadProjectEnv: (projectRoot: string) => unknown;
  getEnvFiles: (options: { mode: string; silent?: boolean }) => string[];
  isEnabled: () => boolean;
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const appArg = args.indexOf('--app');
const appRoot = appArg >= 0 ? resolve(args[appArg + 1] ?? '') : join(repoRoot, 'apps/mobile');

try {
  // apps/mobile depends on @expo/env directly (pnpm does not expose @expo/cli's copy).
  const expoEnv = createRequire(join(repoRoot, 'apps/mobile/package.json'))('@expo/env') as ExpoEnv;
  // Same order as @expo/cli exportAppAsync.
  expoEnv.setNodeEnv('production');
  expoEnv.loadProjectEnv(appRoot);
  parseEnv(process.env, 'web');
  const files = expoEnv.isEnabled()
    ? expoEnv.getEnvFiles({ mode: 'production', silent: true }).join(', ')
    : 'no .env files (EXPO_NO_DOTENV)';
  console.log(`web export preflight ok (${files} in ${appRoot})`);
} catch (error) {
  if (error instanceof EnvError) {
    console.error(`web export preflight failed:\n${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
}
