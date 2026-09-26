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
