import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { OfflineBanner } from '@/components/Banner';
import { ToastHost } from '@/components/Toast';
import { launchStartedAt } from '@/features/auth/launchTiming';
import { SessionExpiredSheet } from '@/features/auth/SessionExpiredSheet';
import { watchSessionExpiry } from '@/features/auth/sessionExpiry';
import { getEnv } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';
import { createQueryClient, wireQueryManagers } from '@/lib/queryClient';
import { startTelemetry, useTelemetry } from '@/lib/telemetry';
import { useKeepModeOnFontScale } from '@/theme/mode';

// Fail fast: a missing or invalid EXPO_PUBLIC_* value stops the app at launch
// with a message naming each variable (P1-ENV-01).
getEnv();
wireQueryManagers();
startTelemetry();

// The native splash stays until the launch gate routes (A01). The timer below
// is a backstop so a deep link that skips the Launch screen never hangs on it.
launchStartedAt.ms = performance.now();
void SplashScreen.preventAutoHideAsync().catch(() => {});
const SPLASH_BACKSTOP_MS = 2500;

export default function RootLayout() {
  // Navigation chrome and the status bar follow the Unistyles theme (P2-TOK-03).
  const { rt } = useUnistyles();
  const dark = rt.themeName === 'dark';
  const [queryClient] = useState(createQueryClient);
  useKeepModeOnFontScale();
  useDevRouteLog();
  useTelemetry();
  useEffect(() => watchSessionExpiry(getSupabase().auth), []);
  useEffect(() => {
    const t = setTimeout(() => void SplashScreen.hideAsync().catch(() => {}), SPLASH_BACKSTOP_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={dark ? DarkTheme : DefaultTheme}>
            <Stack screenOptions={{ headerShown: false }} />
            <SessionExpiredSheet />
            <OfflineBanner />
            <ToastHost />
            <StatusBar style={dark ? 'light' : 'dark'} />
          </ThemeProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

/** Dev only: prints each route change to the Metro log so Simulator checks can be read from it. */
function useDevRouteLog() {
  const pathname = usePathname();
  useEffect(() => {
    if (__DEV__ && process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console -- dev-only navigation trace, stripped from release
      console.log(`[route] ${pathname}`);
    }
  }, [pathname]);
}
