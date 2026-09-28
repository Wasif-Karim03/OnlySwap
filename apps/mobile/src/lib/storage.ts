import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createMMKV, type MMKV } from 'react-native-mmkv';

/**
 * Typed, versioned app storage (T-UNIT-LIB-08).
 * MMKV is encrypted (AES-256) with a random key kept in SecureStore
 * (SECURITY §5). The auth session itself lives in SecureStore, see
 * `secureSessionStorage` below.
 */

export type StorageSchema = {
  'theme.mode': 'system' | 'light' | 'dark';
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
};

export type StorageKey = keyof StorageSchema;

export const STORAGE_VERSION = 1;
const VERSION_KEY = '__storage_version';
const MMKV_KEY_NAME = 'onlyswap.mmkv.key.v1';

/** Each entry upgrades storage from `from` to `from + 1`. */
export type Migration = { from: number; run: (store: MMKV) => void };

export const MIGRATIONS: Migration[] = [
  // v0 → v1: first versioned layout. Nothing existed before, so only stamp it.
  { from: 0, run: () => {} },
];

export function runMigrations(
  store: MMKV,
  migrations: Migration[] = MIGRATIONS,
  target = STORAGE_VERSION,
): number {
  let version = store.getNumber(VERSION_KEY) ?? 0;
  while (version < target) {
    const step = migrations.find((m) => m.from === version);
    if (!step) throw new Error(`storage: no migration from v${version}`);
    step.run(store);
    version += 1;
    store.set(VERSION_KEY, version);
  }
  return version;
}

export function createTypedStorage(store: MMKV) {
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

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 32-char key (AES-256 max is 32 bytes), created once per install. */
export function getOrCreateEncryptionKey(): string {
  const existing = SecureStore.getItem(MMKV_KEY_NAME);
  if (existing) return existing;
  const key = hex(Crypto.getRandomBytes(16));
  SecureStore.setItem(MMKV_KEY_NAME, key, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  return key;
}

let appStore: TypedStorage | undefined;

export function getStorage(): TypedStorage {
  if (!appStore) {
    const mmkv = createMMKV({
      id: 'onlyswap',
      encryptionKey: getOrCreateEncryptionKey(),
      encryptionType: 'AES-256',
    });
    runMigrations(mmkv);
    appStore = createTypedStorage(mmkv);
  }
  return appStore;
}

/**
 * Supabase auth storage backed by SecureStore. Values are split into chunks
 * because SecureStore warns above 2048 bytes and a session JSON is larger.
 */
const CHUNK = 1800;

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = Number(await SecureStore.getItemAsync(`${key}.n`));
    if (!count) return SecureStore.getItemAsync(key);
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    await secureSessionStorage.removeItem(key);
    const count = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK), {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
    }
    await SecureStore.setItemAsync(`${key}.n`, String(count));
  },
  async removeItem(key: string): Promise<void> {
    const count = Number(await SecureStore.getItemAsync(`${key}.n`));
    for (let i = 0; i < (count || 0); i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(`${key}.n`);
    await SecureStore.deleteItemAsync(key);
  },
};
