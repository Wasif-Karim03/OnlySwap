import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { OfflineBanner } from '@/components/Banner';
import { ToastHost } from '@/components/Toast';
import { getEnv } from '@/lib/env';
import { createQueryClient, wireQueryManagers } from '@/lib/queryClient';
import { useKeepModeOnFontScale } from '@/theme/mode';

// Fail fast: a missing or invalid EXPO_PUBLIC_* value stops the app at launch
// with a message naming each variable (P1-ENV-01).
getEnv();
wireQueryManagers();

export default function RootLayout() {
  // Navigation chrome and the status bar follow the Unistyles theme (P2-TOK-03).
  const { rt } = useUnistyles();
  const dark = rt.themeName === 'dark';
  const [queryClient] = useState(createQueryClient);
  useKeepModeOnFontScale();

  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={dark ? DarkTheme : DefaultTheme}>
            <Stack screenOptions={{ headerShown: false }} />
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
