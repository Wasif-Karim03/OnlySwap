import { accents, makeTheme, type AccentName } from '@onlyswap/tokens';
import { UnistylesRuntime } from 'react-native-unistyles';

export const ACCENT_NAMES = Object.keys(accents) as AccentName[];

/**
 * Dev builds only (P2-KIT-01): re-skins the running app with another accent so
 * the kit can be checked in every mode x accent pair. Not persisted; the app
 * accent is still APP_ACCENT (DEC-5).
 */
export function previewAccent(accent: AccentName): void {
  UnistylesRuntime.updateTheme('light', () => makeTheme('light', accent));
  UnistylesRuntime.updateTheme('dark', () => makeTheme('dark', accent));
}
