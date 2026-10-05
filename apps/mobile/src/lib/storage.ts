import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createMMKV } from 'react-native-mmkv';

import {
  createTypedStorage,
  runMigrations,
  type SessionStorage,
  type TypedStorage,
} from './storageCore';

/**
 * Typed, versioned app storage (T-UNIT-LIB-08), iOS and Android.
 * MMKV is encrypted (AES-256) with a random key kept in SecureStore
 * (SECURITY §5). The auth session itself lives in SecureStore, see
 * `secureSessionStorage` below. The web app uses `storage.web.ts`.
 */

export {
  createTypedStorage,
  MIGRATIONS,
  runMigrations,
  STORAGE_VERSION,
  type KVStore,
  type Migration,
  type SessionStorage,
  type StorageKey,
  type StorageSchema,
  type TypedStorage,
} from './storageCore';

const MMKV_KEY_NAME = 'onlyswap.mmkv.key.v1';

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

export const secureSessionStorage: SessionStorage = {
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
