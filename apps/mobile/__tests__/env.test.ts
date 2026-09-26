import { EnvError, parseEnv } from '../src/lib/env';

const valid = {
  EXPO_PUBLIC_APP_ENV: 'staging',
  EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test_only_not_a_real_key',
  EXPO_PUBLIC_MEDIA_URL: 'https://media.onlyswap.workers.dev',
  EXPO_PUBLIC_SITE_URL: 'https://onlyswap.pages.dev',
};

describe('P1-ENV-01 env validation', () => {
  it('accepts a complete config', () => {
    expect(parseEnv(valid)).toEqual(valid);
  });

  it('accepts http only for local development hosts', () => {
    expect(() =>
      parseEnv({
        ...valid,
        EXPO_PUBLIC_APP_ENV: 'local',
        EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      }),
    ).not.toThrow();
    expect(() => parseEnv({ ...valid, EXPO_PUBLIC_SUPABASE_URL: 'http://example.com' })).toThrow(
      /EXPO_PUBLIC_SUPABASE_URL must be https/,
    );
  });

  it('crashes with a clear message listing every missing variable', () => {
    let error: unknown;
    try {
      parseEnv({ ...valid, EXPO_PUBLIC_SUPABASE_URL: undefined, EXPO_PUBLIC_MEDIA_URL: '' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EnvError);
    const message = (error as Error).message;
    expect(message).toContain('EXPO_PUBLIC_SUPABASE_URL is missing');
    expect(message).toContain('EXPO_PUBLIC_MEDIA_URL is missing');
    expect(message).toContain('.env.example');
  });

  it('rejects an unknown environment name', () => {
    expect(() => parseEnv({ ...valid, EXPO_PUBLIC_APP_ENV: 'prod' })).toThrow(
      /EXPO_PUBLIC_APP_ENV/,
    );
  });

  it('refuses a Supabase secret key in the app (T-SEC-12)', () => {
    expect(() =>
      parseEnv({ ...valid, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_test_only_not_a_real_key' }),
    ).toThrow(/is a secret key/);
  });
});
