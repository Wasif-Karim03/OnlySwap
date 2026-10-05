import { Platform } from 'react-native';

/**
 * Platform guards for the student web app (P13-WEB-07, F36). The web build is
 * the same Expo Router app exported for browsers; anything that needs a phone
 * (push, widgets, Live Activities, app icons, the camera, the meetup map,
 * haptics) checks here and hides itself or does nothing on web.
 *
 * Read at call time (not cached) so tests can switch `Platform.OS`.
 */
export function isWebPlatform(os: string = Platform.OS): boolean {
  return os === 'web';
}

/** Features the web app leaves out, in one place for the settings and tests. */
export const WEB_HIDDEN = [
  // Push primer and the "notifications are off" banner: web never registers for push.
  'push',
  'app-icon',
  'live-activities',
  'widgets',
  'camera',
  'spots-map',
] as const;

export type WebHidden = (typeof WEB_HIDDEN)[number];

/** True when `feature` should show on this platform. */
export function supportsFeature(feature: WebHidden, os: string = Platform.OS): boolean {
  if (!isWebPlatform(os)) return true;
  return !WEB_HIDDEN.includes(feature);
}

/** The parts of a TextInput key event the web Enter-to-send check reads. */
export type KeyEventLike = {
  nativeEvent: { key: string; shiftKey?: boolean; isComposing?: boolean };
};

/**
 * Web chat composer (P13-WEB-07): Enter sends, Shift+Enter adds a line, and
 * Enter while an input method is composing (Japanese, Chinese) does nothing.
 * Always false on phones, where Return in a multiline field is a new line.
 */
export function enterSends(e: KeyEventLike, os: string = Platform.OS): boolean {
  if (!isWebPlatform(os)) return false;
  const { key, shiftKey, isComposing } = e.nativeEvent;
  return key === 'Enter' && !shiftKey && !isComposing;
}
