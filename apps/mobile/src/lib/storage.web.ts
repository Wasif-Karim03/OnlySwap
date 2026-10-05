import {
  createTypedStorage,
  runMigrations,
  type KVStore,
  type SessionStorage,
  type TypedStorage,
} from './storageCore';

/**
 * App storage for the student web app (P13-WEB-07). Same API as `storage.ts`
 * (Metro picks this file for web), backed by the browser's localStorage:
 * MMKV encryption and SecureStore don't exist in a browser. Values are scoped
 * under a prefix so `clearAll` never touches other keys on the origin. When
 * localStorage is unavailable (blocked cookies, some private modes) the store
 * falls back to memory for the tab's lifetime.
 *
 * The Supabase session uses the standard supabase-js browser behaviour
 * (localStorage); the CSP in `public/_headers` is the XSS guard (SECURITY §5).
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

/** Minimal Web Storage surface (window.localStorage or the memory fallback). */
export type WebStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export const WEB_PREFIX = 'onlyswap:';

function memoryStorage(): WebStorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

let memoryFallback: WebStorageLike | undefined;

/** window.localStorage when it works, else an in-memory store. */
export function browserStorage(): WebStorageLike {
  try {
    const ls = globalThis.localStorage;
    if (ls) {
      const probe = `${WEB_PREFIX}__probe`;
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    }
  } catch {
    // Storage blocked; use memory.
  }
  memoryFallback ??= memoryStorage();
  return memoryFallback;
}

/** A KVStore (the MMKV calls storage uses) over Web Storage, under a prefix. */
export function createWebKV(
  backing: WebStorageLike = browserStorage(),
  prefix = WEB_PREFIX,
): KVStore {
  const k = (key: string) => `${prefix}${key}`;
  return {
    getString: (key) => backing.getItem(k(key)) ?? undefined,
    getNumber: (key) => {
      const raw = backing.getItem(k(key));
      if (raw === null) return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    },
    set: (key, value) => {
      if (value instanceof ArrayBuffer)
        throw new Error('storage.web: ArrayBuffer values are not supported');
      backing.setItem(k(key), String(value));
    },
    remove: (key) => {
      const had = backing.getItem(k(key)) !== null;
      backing.removeItem(k(key));
      return had;
    },
    clearAll: () => {
      const keys: string[] = [];
      for (let i = 0; i < backing.length; i++) {
        const key = backing.key(i);
        if (key?.startsWith(prefix)) keys.push(key);
      }
      for (const key of keys) backing.removeItem(key);
    },
  };
}

let appStore: TypedStorage | undefined;

export function getStorage(): TypedStorage {
  if (!appStore) {
    const kv = createWebKV();
    runMigrations(kv);
    appStore = createTypedStorage(kv);
  }
  return appStore;
}

/** Supabase auth storage on web: localStorage, as supabase-js does in a browser. */
export const secureSessionStorage: SessionStorage = {
  async getItem(key) {
    return browserStorage().getItem(key);
  },
  async setItem(key, value) {
    browserStorage().setItem(key, value);
  },
  async removeItem(key) {
    browserStorage().removeItem(key);
  },
};
