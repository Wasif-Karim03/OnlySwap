/**
 * Starts crash reporting and analytics once at launch and follows sign-in and
 * sign-out (P1-LIB-02). Both are off unless their public keys are set.
 */
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import { useEffect } from 'react';

import { identify, initAnalytics, resetAnalytics, track } from '@/lib/analytics';
import { getEnv } from '@/lib/env';
import { initSentry } from '@/lib/sentry';
import { getSupabase } from '@/lib/supabase';

const sha256 = (s: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);

export function startTelemetry(): void {
  const env = getEnv();
  const version = Application.nativeApplicationVersion ?? undefined;
  const build = Application.nativeBuildVersion ?? undefined;
  try {
    initSentry(
      env.EXPO_PUBLIC_SENTRY_DSN,
      env.EXPO_PUBLIC_APP_ENV,
      version ? `onlyswap@${version}+${build ?? '0'}` : undefined,
      build,
    );
  } catch {
    // never block launch on telemetry
  }
  try {
    initAnalytics(env.EXPO_PUBLIC_POSTHOG_KEY, env.EXPO_PUBLIC_POSTHOG_HOST);
  } catch {
    // ignore
  }
}

/** Root layout: app_opened once, identify on sign-in, reset on sign-out. */
export function useTelemetry(): void {
  useEffect(() => {
    track('app_opened');
    const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        void identify(session.user.id, sha256);
      } else if (event === 'SIGNED_OUT') {
        resetAnalytics();
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
}
