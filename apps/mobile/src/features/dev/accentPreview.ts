import { accents, makeTheme, type AccentName } from '@onlyswap/tokens';
import { UnistylesRuntime } from 'react-native-unistyles';

import { APP_ACCENT } from '@/theme/themes';

export const ACCENT_NAMES = Object.keys(accents) as AccentName[];

let current: AccentName = APP_ACCENT;

/** The accent the running app is showing (survives leaving the kit). */
export function currentPreviewAccent(): AccentName {
  return current;
}

/**
 * Dev builds only (P2-KIT-01): re-skins the running app with another accent so
 * the kit can be checked in every mode x accent pair. Not persisted; the app
 * accent is still APP_ACCENT (DEC-5).
 */
export function previewAccent(accent: AccentName): void {
  current = accent;
  UnistylesRuntime.updateTheme('light', () => makeTheme('light', accent));
  UnistylesRuntime.updateTheme('dark', () => makeTheme('dark', accent));
}
