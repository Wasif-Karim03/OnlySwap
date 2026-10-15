import { getStorage } from '@/lib/storage';

/**
 * Recently viewed listings (DEC 128): ids on this phone only, newest first.
 * Search shows them before you type; nothing is sent until then, and only
 * to fetch the cards.
 */
export const VIEWED_MAX = 20;

export function addViewed(list: string[], id: string): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, VIEWED_MAX);
}

export function parseViewed(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string').slice(0, VIEWED_MAX)
    : [];
}

export type ViewedStorage = { get: () => unknown; set: (v: string[]) => void };

export const viewedStorage: ViewedStorage = {
  get: () => getStorage().get('feed.recentlyViewed'),
  set: (v) => getStorage().set('feed.recentlyViewed', v),
};

export function rememberViewed(id: string, store: ViewedStorage = viewedStorage): void {
  try {
    store.set(addViewed(parseViewed(store.get()), id));
  } catch {
    // Storage can be unavailable (web private mode); the list is a convenience.
  }
}
