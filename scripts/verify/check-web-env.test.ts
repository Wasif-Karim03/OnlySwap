// IR4-04, IR5-02: the web export preflight loads env like `expo export` and
// refuses a web build without the Turnstile site key.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-web-env.ts');
const TEST_KEY = '1x00000000000000000000AA';

const BASE: Record<string, string> = {
  EXPO_PUBLIC_APP_ENV: 'local',
  EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-for-tests-only-x',
  EXPO_PUBLIC_MEDIA_URL: 'http://127.0.0.1:8787',
  EXPO_PUBLIC_SITE_URL: 'http://127.0.0.1:3000',
};

const dotenv = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([k, v]) => `${k}=${v}\n`)
    .join('');

/** Runs the preflight on a fresh app dir; the child env is only PATH plus `env`. */
function run(files: Record<string, Record<string, string>>, env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'web-env-'));
  try {
    for (const [name, vars] of Object.entries(files)) writeFileSync(join(dir, name), dotenv(vars));
    return spawnSync(process.execPath, ['--experimental-strip-types', SCRIPT, '--app', dir], {
      env: { PATH: process.env.PATH ?? '', ...env },
      encoding: 'utf8',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('fails when the Turnstile site key is absent', () => {
  const res = run({ '.env': BASE });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /EXPO_PUBLIC_TURNSTILE_SITE_KEY is missing/);
});

test('loads .env.local like expo export', () => {
  const res = run({ '.env': BASE, '.env.local': { EXPO_PUBLIC_TURNSTILE_SITE_KEY: TEST_KEY } });
  assert.equal(res.status, 0, res.stderr);
  assert.doesNotMatch(res.stdout, new RegExp(TEST_KEY));
});

test('the process env wins over files', () => {
  const res = run({ '.env': BASE }, { EXPO_PUBLIC_TURNSTILE_SITE_KEY: TEST_KEY });
  assert.equal(res.status, 0, res.stderr);
  // A bad value in a file does not override a good one from the process.
  const bad = { ...BASE, EXPO_PUBLIC_TURNSTILE_SITE_KEY: 'short' };
  const kept = run({ '.env': bad }, { EXPO_PUBLIC_TURNSTILE_SITE_KEY: TEST_KEY });
  assert.equal(kept.status, 0, kept.stderr);
});

test('reuses the full env validation', () => {
  const { EXPO_PUBLIC_SUPABASE_URL: _url, ...rest } = BASE;
  const res = run({ '.env': { ...rest, EXPO_PUBLIC_TURNSTILE_SITE_KEY: TEST_KEY } });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /EXPO_PUBLIC_SUPABASE_URL is missing/);
});

test('EXPO_NO_DOTENV skips files', () => {
  const res = run(
    { '.env': { ...BASE, EXPO_PUBLIC_TURNSTILE_SITE_KEY: TEST_KEY } },
    { EXPO_NO_DOTENV: '1' },
  );
  assert.equal(res.status, 1);
  assert.match(res.stderr, /EXPO_PUBLIC_TURNSTILE_SITE_KEY is missing/);
});
