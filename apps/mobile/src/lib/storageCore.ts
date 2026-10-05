import type { MMKV } from 'react-native-mmkv';

/**
 * Platform-neutral part of app storage (T-UNIT-LIB-08): the typed schema,
 * versioned migrations and the typed wrapper. `storage.ts` backs it with
 * encrypted MMKV on iOS/Android; `storage.web.ts` backs it with localStorage
 * for the student web app (P13-WEB-07). Both export the same API.
 */

export type StorageSchema = {
  'theme.mode': 'system' | 'light' | 'dark';
  /** Language setting (P17-FEAT-03); read once at startup by strings/index.ts. */
  'settings.language': 'system' | 'en' | 'es';
  'privacy.analyticsOptOut': boolean;
  'privacy.crashOptOut': boolean;
  'onboarding.swipeCoachSeen': boolean;
  'onboarding.notificationsAsked': boolean;
  /** The Sell draft; checked and versioned by features/sell/logic.ts (T-UNIT-SELL-01). */
  'sell.draft': unknown;
  /** Swipes not yet sent to record_swipes (features/feed/swipes.ts), newest 200. */
  'feed.swipeQueue': unknown;
  /** Recent search text, newest first (features/search/logic.ts). */
  'search.recent': unknown;
  /** Last time we asked for an App Store / Play review (ISO), X26. */
  'review.lastAskedAt': string;
  /** Invite code from an /i/{code} link, sent with the sign-up (features/auth/invite.ts). */
  'auth.inviteCode': { code: string; savedAt: string };
  /** Upcoming meetups the app has seen, for the widget (features/widgets/logic.ts KnownMeetup[]). */
  'widgets.meetups': unknown;
  /** The last widget payload sent to the home screen (Android redraws from it). */
  'widgets.payload': unknown;
  /** Live Activity content by ActivityKit id, so the app can match running activities to meetups. */
  'widgets.liveProps': unknown;
  /** Settings > Appearance "Show meetups on the Lock Screen" (P17-FEAT-01). Unset means on. */
  'settings.liveActivities': boolean;
  /** Settings > Appearance app icon (R2-ICON-01). */
  'settings.appIcon': 'default' | 'night' | 'paper' | 'mono';
};

export type StorageKey = keyof StorageSchema;

/** The key-value calls storage needs; MMKV and the web store both provide them. */
export type KVStore = Pick<MMKV, 'getString' | 'getNumber' | 'set' | 'remove' | 'clearAll'>;

export const STORAGE_VERSION = 1;
export const VERSION_KEY = '__storage_version';

/** Each entry upgrades storage from `from` to `from + 1`. */
export type Migration = { from: number; run: (store: MMKV) => void };

export const MIGRATIONS: Migration[] = [
  // v0 → v1: first versioned layout. Nothing existed before, so only stamp it.
  { from: 0, run: () => {} },
];

export function runMigrations(
  store: KVStore,
  migrations: Migration[] = MIGRATIONS,
  target = STORAGE_VERSION,
): number {
  let version = store.getNumber(VERSION_KEY) ?? 0;
  while (version < target) {
    const step = migrations.find((m) => m.from === version);
    if (!step) throw new Error(`storage: no migration from v${version}`);
    // Migrations only use the KVStore calls; the MMKV type is kept for callers.
    step.run(store as MMKV);
    version += 1;
    store.set(VERSION_KEY, version);
  }
  return version;
}

export function createTypedStorage(store: KVStore) {
  return {
    get<K extends StorageKey>(key: K): StorageSchema[K] | undefined {
      const raw = store.getString(key);
      if (raw === undefined) return undefined;
      try {
        return JSON.parse(raw) as StorageSchema[K];
      } catch {
        store.remove(key);
        return undefined;
      }
    },
    set<K extends StorageKey>(key: K, value: StorageSchema[K]): void {
      store.set(key, JSON.stringify(value));
    },
    remove(key: StorageKey): void {
      store.remove(key);
    },
    clearAll(): void {
      store.clearAll();
      store.set(VERSION_KEY, STORAGE_VERSION);
    },
  };
}

export type TypedStorage = ReturnType<typeof createTypedStorage>;

/** Supabase auth storage shape (supabase-js `SupportedStorage`, async form). */
export type SessionStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
