import { QueryClientProvider } from '@tanstack/react-query';
import {
  DarkTheme,
  DefaultTheme,
  type ErrorBoundaryProps,
  type Href,
  Stack,
  ThemeProvider,
  usePathname,
  useRouter,
} from 'expo-router';
import * as Application from 'expo-application';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { OfflineBanner } from '@/components/Banner';
import { CrashScreen } from '@/components/CrashScreen';
import { ToastHost } from '@/components/Toast';
import { watchAccountReset } from '@/features/auth/accountReset';
import { LaunchIntro } from '@/features/auth/LaunchIntro';
import { launchStartedAt } from '@/features/auth/launchTiming';
import { SessionExpiredSheet } from '@/features/auth/SessionExpiredSheet';
import { authApi } from '@/features/auth/api';
import { startAppTransactionLink } from '@/features/auth/appTransaction';
import { watchSessionExpiry } from '@/features/auth/sessionExpiry';
import { watchSystemGate } from '@/features/auth/systemWatch';
import { resetChatStores } from '@/features/chat/useChat';
import { resetSwipeStore } from '@/features/feed/swipes';
import { startWidgetSync } from '@/features/widgets/sync';
import { startActivity } from '@/lib/activity';
import { getEnv } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';
import { createQueryClient, wireQueryManagers } from '@/lib/queryClient';
import { clearPersistedQueries, startQueryPersist } from '@/lib/queryPersist';
import { startTelemetry, useTelemetry } from '@/lib/telemetry';
import { useWebTitle } from '@/lib/webTitle';
import { useKeepModeOnFontScale } from '@/theme/mode';

import { appTransactionNative } from '../modules/app-transaction';

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

/**
 * A render crash on any screen shows the crash screen with Try again instead
 * of a blank one, and goes to Sentry (F-08, DEC 103). Expo Router uses this
 * export by name.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <CrashScreen error={error} retry={retry} />;
}

export default function RootLayout() {
  // Navigation chrome and the status bar follow the Unistyles theme (P2-TOK-03).
  const { rt } = useUnistyles();
  const dark = rt.themeName === 'dark';
  const [queryClient] = useState(createQueryClient);
  useKeepModeOnFontScale();
  useDevRouteLog();
  // Web app (P13-WEB-07): a page title per route.
  useWebTitle();
  useTelemetry();
  useEffect(() => watchSessionExpiry(getSupabase().auth), []);
  // Sign-out or another account: drop the last account's cached data (C-03).
  useEffect(
    () =>
      watchAccountReset(getSupabase().auth, queryClient, [
        resetChatStores,
        resetSwipeStore,
        clearPersistedQueries,
      ]),
    [queryClient],
  );
  // Inbox, Profile and the bell open with the last data, then refresh (lib/queryPersist.ts).
  useEffect(() => startQueryPersist(queryClient, getSupabase().auth), [queryClient]);
  // Home screen widget + meetup Live Activity follow the meetups the app loads (P17-FEAT-01).
  useEffect(() => startWidgetSync(queryClient), [queryClient]);
  // Activity events for the admin console (DEC 93): follows sign-in, flushes on background.
  useEffect(() => startActivity(), []);
  useEffect(
    () =>
      startAppTransactionLink(
        getSupabase().auth,
        appTransactionNative,
        authApi.linkAppTransaction,
        Platform.OS,
      ),
    [],
  );
  // Maintenance or a forced update turned on while the app was in the background.
  useSystemWatch(queryClient);
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
            <LaunchIntro />
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

function useSystemWatch(queryClient: ReturnType<typeof createQueryClient>) {
  const router = useRouter();
  const pathname = usePathname();
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  }, [pathname]);
  useEffect(
    () =>
      watchSystemGate({
        appState: AppState,
        queryClient,
        fetchConfig: () => authApi.getAppConfig(),
        appVersion: Application.nativeApplicationVersion ?? '0',
        platform: Platform.OS === 'android' ? 'android' : Platform.OS === 'web' ? 'web' : 'ios',
        currentPath: () => path.current,
        navigate: (href) => router.replace(href as Href),
      }),
    [queryClient, router],
  );
}
