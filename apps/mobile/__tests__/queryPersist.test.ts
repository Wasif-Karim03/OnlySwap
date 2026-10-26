// lib/queryPersist.ts: last Inbox/Profile data shown on a cold start (2026-10-25).
import { QueryClient } from '@tanstack/react-query';

import {
  clearPersistedQueries,
  isPersistedKey,
  PERSIST_MAX_AGE_MS,
  restoreQueries,
  saveQueries,
} from '../src/lib/queryPersist';

function memory() {
  const m = new Map<string, unknown>();
  return {
    get: (k: string) => m.get(k),
    set: (k: string, v: unknown) => void m.set(k, v),
    remove: (k: string) => void m.delete(k),
  } as never;
}

describe('queryPersist', () => {
  it('keeps only Inbox, Profile and the bell', () => {
    expect(isPersistedKey(['inbox'])).toBe(true);
    expect(isPersistedKey(['me'])).toBe(true);
    expect(isPersistedKey(['notifications', 'unread'])).toBe(true);
    expect(isPersistedKey(['chat', 'c1'])).toBe(false);
    expect(isPersistedKey(['campus-feed', 'all'])).toBe(false);
  });

  it('restores for the same account, within a day', () => {
    const s = memory();
    const a = new QueryClient();
    a.setQueryData(['inbox'], { rows: [1] });
    a.setQueryData(['chat', 'c1'], { secret: true });
    saveQueries(a, 'u1', s, 1000);
    const b = new QueryClient();
    expect(restoreQueries(b, 'u1', s, 2000)).toBe(true);
    expect(b.getQueryData(['inbox'])).toEqual({ rows: [1] });
    expect(b.getQueryData(['chat', 'c1'])).toBeUndefined();
  });

  it('never restores another account or old data', () => {
    const s = memory();
    const a = new QueryClient();
    a.setQueryData(['me'], { name: 'A' });
    saveQueries(a, 'u1', s, 1000);
    expect(restoreQueries(new QueryClient(), 'u2', s, 2000)).toBe(false);
    expect(restoreQueries(new QueryClient(), 'u1', s, 1000 + PERSIST_MAX_AGE_MS + 1)).toBe(false);
  });

  it('sign-out clears it', () => {
    const s = memory();
    const a = new QueryClient();
    a.setQueryData(['me'], { name: 'A' });
    saveQueries(a, 'u1', s, 1000);
    clearPersistedQueries(s);
    expect(restoreQueries(new QueryClient(), 'u1', s, 2000)).toBe(false);
  });
});
