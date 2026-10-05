/**
 * The active copy for the app (P17-FEAT-03, DEC 76). App code imports from
 * `@/strings`, never from a locale file. The locale is picked once when this
 * module loads: the saved Language setting, else the phone's language. Screens
 * keep module-level `copy` constants, so switching language reloads the JS
 * bundle (`setLanguage`). en.ts stays the source of truth; es.ts mirrors it.
 *
 * Under Jest the app always runs in English so tests can match en.ts text.
 */

import { DevSettings } from 'react-native';

import { en, type Strings } from './en';
import { es } from './es';

export type Locale = 'en' | 'es';
export type LanguagePref = 'system' | Locale;

export const LANGUAGE_PREFS: readonly LanguagePref[] = ['system', 'en', 'es'];

const LOCALES: Record<Locale, Strings> = { en, es };

/** BCP 47 tags for Intl number and date formatting. Spanish uses US conventions ($, 1,234.50). */
export const INTL_TAGS: Record<Locale, string> = { en: 'en-US', es: 'es-US' };

/** 'es' for any Spanish tag ("es", "es-MX", "es_US", "ES-419"), else 'en'. */
export function localeFromTag(tag: string | null | undefined): Locale {
  return /^es(?:[-_]|$)/i.test((tag ?? '').trim()) ? 'es' : 'en';
}

function isPref(value: unknown): value is LanguagePref {
  return value === 'system' || value === 'en' || value === 'es';
}

/** A saved 'en' or 'es' wins; 'system', nothing saved or junk follows the device. */
export function resolveLocale(pref: unknown, deviceTag: string | null | undefined): Locale {
  if (pref === 'en' || pref === 'es') return pref;
  return localeFromTag(deviceTag);
}

/** The phone's language tag, read through Intl so no extra package is needed. */
export function deviceLocaleTag(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

/** The saved Language setting, or 'system'. */
export function getLanguagePref(): LanguagePref {
  try {
    // Loaded lazily: storage pulls in native modules this file must not need under Jest.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getStorage } = require('@/lib/storage') as typeof import('@/lib/storage');
    const saved = getStorage().get('settings.language');
    return isPref(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

/** True under Jest. Read at run time: NODE_ENV is inlined at build time by babel-preset-expo. */
function underJest(): boolean {
  return typeof process !== 'undefined' && process.env.JEST_WORKER_ID !== undefined;
}

function startupLocale(): Locale {
  if (underJest()) return 'en';
  return resolveLocale(getLanguagePref(), deviceLocaleTag());
}

/** The language the app is showing for this run. */
export const locale: Locale = startupLocale();

/** The Intl tag for `locale`, for number and date formatting. */
export const intlLocale: string = INTL_TAGS[locale];

export const strings: Strings = LOCALES[locale];

/** Reloads the JS bundle: expo-updates in release builds, DevSettings in dev. */
export async function reloadApp(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Updates = require('expo-updates') as typeof import('expo-updates');
    await Updates.reloadAsync();
    return;
  } catch {
    // Not available (dev client without updates, or Expo Go): fall through.
  }
  DevSettings.reload();
}

export type SetLanguageDeps = {
  save?: (pref: LanguagePref) => void;
  reload?: () => Promise<void> | void;
};

/** Saves the Language setting and restarts the JS so every screen picks it up. */
export async function setLanguage(pref: LanguagePref, deps: SetLanguageDeps = {}): Promise<void> {
  const save =
    deps.save ??
    ((p: LanguagePref) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getStorage } = require('@/lib/storage') as typeof import('@/lib/storage');
      getStorage().set('settings.language', p);
    });
  save(pref);
  await (deps.reload ?? reloadApp)();
}

export const {
  permissions,
  tabs,
  shell,
  errors,
  sheet,
  toast,
  banner,
  photo,
  states,
  nav,
  primer,
  report,
  dev,
  kit,
  kit2,
  statesFx,
  launch,
  welcome,
  signIn,
  age,
  profileSetup,
  rules,
  notifyPrimer,
  sessionExpired,
  reverify,
  emailAccess,
  sell,
  feed,
  search,
  saved,
  profileView,
  offers,
  chat,
  meetup,
  deal,
  notificationsScreen,
  safety,
  me,
  settings,
  legal,
  system,
  quad,
  campus,
  waitlist,
  unlocked,
  spotsMap,
} = strings;

export type { Strings };
