import { z } from 'zod';

/**
 * Public runtime config (P1-ENV-01). Only `EXPO_PUBLIC_*` values may reach the
 * app bundle (CLAUDE.md rule 7). Each variable is read with a static
 * `process.env.EXPO_PUBLIC_X` expression so Metro can inline it at build time.
 * Values come from `.env.local` (local) or EAS environment variables (builds).
 */

const supabaseKey = z
  .string()
  .min(20)
  .refine((v) => !v.startsWith('sb_secret_'), {
    message: 'is a secret key; use the anon or publishable key',
  });

const httpsOrLocalUrl = z
  .url()
  .refine(
    (v) =>
      /^https:\/\//.test(v) || /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.)/.test(v),
    {
      message: 'must be https (http is allowed only for local development hosts)',
    },
  );

export const envSchema = z.object({
  EXPO_PUBLIC_APP_ENV: z.enum(['local', 'staging', 'production']),
  EXPO_PUBLIC_SUPABASE_URL: httpsOrLocalUrl,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: supabaseKey,
  EXPO_PUBLIC_MEDIA_URL: httpsOrLocalUrl,
  EXPO_PUBLIC_SITE_URL: httpsOrLocalUrl,
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  override name = 'EnvError';
}

/** Validates raw values; throws one EnvError listing every problem. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) return result.data;
  const lines = result.error.issues.map((issue) => {
    const key = String(issue.path[0] ?? 'env');
    return raw[key] === undefined || raw[key] === ''
      ? `- ${key} is missing`
      : `- ${key} ${issue.message}`;
  });
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
  };
}

let cached: Env | undefined;

/** The validated env. Throws on first use if anything is missing or invalid. */
export function getEnv(): Env {
  cached ??= parseEnv(readRaw());
  return cached;
}
