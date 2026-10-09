/**
 * Public runtime config (P1-ENV-01). Only `EXPO_PUBLIC_*` values may reach the
 * app bundle (CLAUDE.md rule 7). Each variable is read with a static
 * `process.env.EXPO_PUBLIC_X` expression so Metro can inline it at build time.
 * Values come from `.env.local` (local) or EAS environment variables (builds).
 *
 * Plain checks instead of zod: Metro can't tree-shake, and zod added about
 * 500 KB to the app bundle for this one file (Perf-07, DEC 88).
 */

const APP_ENVS = ['local', 'staging', 'production'] as const;

export type Env = {
  EXPO_PUBLIC_APP_ENV: (typeof APP_ENVS)[number];
  EXPO_PUBLIC_SUPABASE_URL: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
  EXPO_PUBLIC_MEDIA_URL: string;
  EXPO_PUBLIC_SITE_URL: string;
  // Optional: telemetry is off when these are empty (local builds, tests).
  EXPO_PUBLIC_SENTRY_DSN?: string;
  EXPO_PUBLIC_POSTHOG_KEY?: string;
  EXPO_PUBLIC_POSTHOG_HOST?: string;
};

/** A problem with one value, or null when it's fine. */
type Check = (value: string) => string | null;

function isUrl(value: string): boolean {
  return /^https?:\/\/[^\s/?#]+[^\s]*$/i.test(value);
}

const url: Check = (v) => (isUrl(v) ? null : 'must be a URL');

const httpsOrLocalUrl: Check = (v) => {
  if (!isUrl(v)) return 'must be a URL';
  const ok =
    /^https:\/\//.test(v) ||
    // Local dev only: loopback, the Android emulator host and private LAN
    // ranges (RFC 1918) so a phone on the same Wi-Fi can reach the Mac.
    /^http:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      v,
    );
  return ok ? null : 'must be https (http is allowed only for local development hosts)';
};

const supabaseKey: Check = (v) => {
  if (v.startsWith('sb_secret_')) return 'is a secret key; use the anon or publishable key';
  return v.length >= 20 ? null : 'is too short to be a Supabase key';
};

const appEnv: Check = (v) =>
  (APP_ENVS as readonly string[]).includes(v) ? null : 'must be local, staging or production';

const posthogKey: Check = (v) =>
  /^phc_[A-Za-z0-9]+$/.test(v) ? null : 'must be a PostHog project key (phc_...)';

const REQUIRED: Record<string, Check> = {
  EXPO_PUBLIC_APP_ENV: appEnv,
  EXPO_PUBLIC_SUPABASE_URL: httpsOrLocalUrl,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: supabaseKey,
  EXPO_PUBLIC_MEDIA_URL: httpsOrLocalUrl,
  EXPO_PUBLIC_SITE_URL: httpsOrLocalUrl,
};

const OPTIONAL: Record<string, Check> = {
  EXPO_PUBLIC_SENTRY_DSN: url,
  EXPO_PUBLIC_POSTHOG_KEY: posthogKey,
  EXPO_PUBLIC_POSTHOG_HOST: url,
};

export class EnvError extends Error {
  override name = 'EnvError';
}

/** Validates raw values; throws one EnvError listing every problem. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const out: Record<string, string> = {};
  const lines: string[] = [];
  for (const [key, check] of Object.entries(REQUIRED)) {
    const value = raw[key];
    if (value === undefined || value === '') {
      lines.push(`- ${key} is missing`);
      continue;
    }
    const problem = check(value);
    if (problem) lines.push(`- ${key} ${problem}`);
    else out[key] = value;
  }
  for (const [key, check] of Object.entries(OPTIONAL)) {
    const value = raw[key];
    if (value === undefined || value === '') continue;
    const problem = check(value);
    if (problem) lines.push(`- ${key} ${problem}`);
    else out[key] = value;
  }
  if (lines.length === 0) return out as Env;
  throw new EnvError(
    [
      'OnlySwap config is invalid:',
      ...lines,
      'Copy apps/mobile/.env.example to apps/mobile/.env.local and fill it in, or set the EAS environment variables for this profile.',
    ].join('\n'),
  );
}

function readRaw(): Record<string, string | undefined> {
  return {
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_MEDIA_URL: process.env.EXPO_PUBLIC_MEDIA_URL,
    EXPO_PUBLIC_SITE_URL: process.env.EXPO_PUBLIC_SITE_URL,
    EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
    EXPO_PUBLIC_POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY,
    EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  };
}

let cached: Env | undefined;

/** The validated env. Throws on first use if anything is missing or invalid. */
export function getEnv(): Env {
  cached ??= parseEnv(readRaw());
  return cached;
}
