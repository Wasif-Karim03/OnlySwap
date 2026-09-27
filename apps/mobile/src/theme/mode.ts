import { useEffect, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { UnistylesRuntime } from 'react-native-unistyles';
import { create } from 'zustand';

import { getStorage } from '@/lib/storage';

/** Appearance setting (F14): System, Light or Dark. */
export type ThemeMode = 'system' | 'light' | 'dark';

export const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];

export function readStoredMode(): ThemeMode {
  const stored = getStorage().get('theme.mode');
  return stored && THEME_MODES.includes(stored) ? stored : 'system';
}

/**
 * Unistyles startup settings for a mode. Applied inside StyleSheet.configure,
 * before the first render, so there is no light-then-dark flash (P2-TOK-03).
 */
export function startupSettings(
  mode: ThemeMode,
): { adaptiveThemes: true } | { initialTheme: 'light' | 'dark' } {
  return mode === 'system' ? { adaptiveThemes: true } : { initialTheme: mode };
}

/** Switches the running app. Synchronous, no re-mount. */
export function applyMode(mode: ThemeMode): void {
  if (mode === 'system') {
    UnistylesRuntime.setAdaptiveThemes(true);
  } else {
    UnistylesRuntime.setAdaptiveThemes(false);
    UnistylesRuntime.setTheme(mode);
  }
}

type ThemeModeState = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

/**
 * Persisted in MMKV. `profiles.theme_mode` sync is added with the profile
 * RPCs (P11-SET-02); this store is the source the app reads.
 */
export const useThemeModeStore = create<ThemeModeState>((set) => ({
  mode: readStoredMode(),
  setMode: (mode) => {
    applyMode(mode);
    getStorage().set('theme.mode', mode);
    set({ mode });
  },
}));

/**
 * Unistyles falls back to the system theme when iOS changes the text size
 * while the app runs, so views mounted after the change (every Text re-mounts
 * to re-layout) came up in light colors under a forced Dark mode. Re-applying
 * the chosen mode on each text-size change keeps every view on one theme.
 * Mounted once in the root layout.
 */
export function useKeepModeOnFontScale(): void {
  const { fontScale } = useWindowDimensions();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    applyMode(useThemeModeStore.getState().mode);
  }, [fontScale]);
}
