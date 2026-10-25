import { getStorage, type TypedStorage } from '@/lib/storage';

/**
 * A shared listing link opened while signed out (UX audit 2026-10-25). Share
 * links are how new students arrive, so instead of an error the link goes to
 * Welcome and the listing opens once they are in. Kept for a day.
 */
export const PENDING_LISTING_MS = 24 * 3600 * 1000;

export type PendingStorage = Pick<TypedStorage, 'get' | 'set' | 'remove'>;

const store = (s?: PendingStorage): PendingStorage | null => {
  if (s) return s;
  try {
    return getStorage();
  } catch {
    return null;
  }
};

export function rememberListingLink(id: string, storage?: PendingStorage, now = new Date()): void {
  store(storage)?.set('auth.pendingListing', { id, savedAt: now.toISOString() });
}

/** The waiting listing id once (it is cleared), or null when none or too old. */
export function takeListingLink(storage?: PendingStorage, now = new Date()): string | null {
  const s = store(storage);
  const saved = s?.get('auth.pendingListing');
  if (!saved) return null;
  s?.remove('auth.pendingListing');
  const at = Date.parse(saved.savedAt);
  if (typeof saved.id !== 'string' || !Number.isFinite(at)) return null;
  return now.getTime() - at <= PENDING_LISTING_MS ? saved.id : null;
}
