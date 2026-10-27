import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { getEnv } from './env';
import { secureSessionStorage } from './storage';

let client: SupabaseClient | undefined;

/** Longest a Supabase request may take before it fails (slowest cold Edge Function is ~3 s). */
export const REQUEST_TIMEOUT_MS = 20_000;

/**
 * fetch with a deadline. A request stuck on a dead connection (iOS after the
 * app comes back from the background) otherwise never settles, and its screen
 * keeps a skeleton up with no error or Retry (owner testing: the Category
 * picker spun forever). A caller's own abort signal still works.
 */
export function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
  baseFetch: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const outer = init.signal;
  const onOuterAbort = () => controller.abort();
  if (outer?.aborted) controller.abort();
  else outer?.addEventListener('abort', onOuterAbort);
  return baseFetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuterAbort);
  });
}

/** The one Supabase client. Anon/publishable key only (CLAUDE.md rule 7). */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const env = getEnv();
    client = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
      auth: {
        storage: secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
      global: { fetch: (input, init) => fetchWithTimeout(input, init) },
    });
    // Refresh tokens only while the app is in the foreground.
    AppState.addEventListener('change', (state) => {
      if (state === 'active') client?.auth.startAutoRefresh();
      else client?.auth.stopAutoRefresh();
    });
  }
  return client;
}
