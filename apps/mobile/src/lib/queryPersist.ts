import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';

import { getStorage, type TypedStorage } from './storage';

/**
 * Keeps the last Inbox, Profile and bell data on the device (encrypted MMKV)
 * so those tabs open with content on a cold start and refresh in the
 * background. Staging measured 100 to 530 ms for the first call on a fresh
 * database connection (owner device check 2026-10-25); a cold app paid that
 * on every tab before showing anything.
 *
 * Only these keys, only for the account that saved them, at most a day old.
 * Sign-out clears it (watchAccountReset extras).
 */
const KEYS: readonly (readonly string[])[] = [
  ['inbox'],
  ['me'],
  ['my-listings'],
  ['notifications', 'unread'],
];
const VERSION = 1;
export const PERSIST_MAX_AGE_MS = 24 * 3600 * 1000;
const SAVE_DELAY_MS = 1000;

type Saved = { v: number; uid: string; at: number; state: DehydratedState };
type Store = Pick<TypedStorage, 'get' | 'set' | 'remove'>;
type Auth = {
  onAuthStateChange: (cb: (event: string, session: { user?: { id?: string } } | null) => void) => {
    data: { subscription: { unsubscribe: () => void } };
  };
};

export function isPersistedKey(key: readonly unknown[]): boolean {
  return KEYS.some((k) => k.length === key.length && k.every((part, i) => part === key[i]));
}

const store = (s?: Store): Store | null => {
  if (s) return s;
  try {
    return getStorage();
  } catch {
    return null;
  }
};

/** Puts the saved queries back when `uid` saved them less than a day ago. */
export function restoreQueries(qc: QueryClient, uid: string, s?: Store, now = Date.now()): boolean {
  try {
    const saved = store(s)?.get('query.cache') as Saved | undefined;
    if (!saved || saved.v !== VERSION || saved.uid !== uid) return false;
    if (now - saved.at > PERSIST_MAX_AGE_MS) return false;
    hydrate(qc, saved.state);
    return true;
  } catch {
    return false;
  }
}

export function saveQueries(qc: QueryClient, uid: string, s?: Store, now = Date.now()): void {
  try {
    const state = dehydrate(qc, {
      shouldDehydrateQuery: (q) => q.state.status === 'success' && isPersistedKey(q.queryKey),
    });
    store(s)?.set('query.cache', { v: VERSION, uid, at: now, state } satisfies Saved);
  } catch {
    // Best effort: a failed save only means a slower next launch.
  }
}

export function clearPersistedQueries(s?: Store): void {
  try {
    store(s)?.remove('query.cache');
  } catch {
    // ignore
  }
}

/** Restores on the first signed-in session, then saves (debounced) after each fresh load. */
export function startQueryPersist(qc: QueryClient, auth: Auth, s?: Store): () => void {
  let uid: string | null = null;
  let restored = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const { data } = auth.onAuthStateChange((_event, session) => {
    uid = session?.user?.id ?? null;
    if (uid && !restored) {
      restored = true;
      restoreQueries(qc, uid, s);
    }
  });
  const unsub = qc.getQueryCache().subscribe((e) => {
    if (e.type !== 'updated' || e.action.type !== 'success' || !isPersistedKey(e.query.queryKey)) {
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (uid) saveQueries(qc, uid, s);
    }, SAVE_DELAY_MS);
  });
  return () => {
    data.subscription.unsubscribe();
    unsub();
    if (timer) clearTimeout(timer);
  };
}
