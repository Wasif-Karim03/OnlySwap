import { useEffect } from 'react';
import { AppState } from 'react-native';
import { createStore, useStore, type StoreApi } from 'zustand';

import { getStorage } from '@/lib/storage';

import { emptyDraft, hasContent, parseStoredDraft, type SellDraft } from './logic';

/**
 * The Sell draft (P5-SELL-02, T-UNIT-SELL-01). One draft at a time, kept in
 * encrypted MMKV and saved shortly after every change, so an app kill loses
 * nothing. `restored` is true when the draft came back from storage with
 * something in it: step 1 then offers "Pick up where you left off?".
 */

export const DRAFT_SAVE_MS = 400;

type DraftStorage = {
  get: () => unknown;
  set: (value: SellDraft) => void;
  remove: () => void;
};

export type DraftState = {
  draft: SellDraft;
  restored: boolean;
  /** When the draft was last written to storage (ms), for "Draft saved". */
  savedAt: number | null;
  update: (patch: Partial<SellDraft> | ((d: SellDraft) => Partial<SellDraft>)) => void;
  /** Keeps the restored draft and hides the restore sheet. */
  keep: () => void;
  /** Throws the draft away (Start over, or after posting). */
  reset: () => void;
  /** Writes any pending change now (app going to the background). */
  flush: () => void;
};

export function createDraftStore(
  storage: DraftStorage,
  { saveMs = DRAFT_SAVE_MS, now = () => new Date() }: { saveMs?: number; now?: () => Date } = {},
): StoreApi<DraftState> {
  const stored = parseStoredDraft(storage.get(), now());
  if (!stored) storage.remove();
  let timer: ReturnType<typeof setTimeout> | null = null;

  return createStore<DraftState>((set, get) => {
    const write = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      const { draft } = get();
      if (hasContent(draft) || draft.listingId) storage.set(draft);
      else storage.remove();
      set({ savedAt: now().getTime() });
    };
    return {
      draft: stored ?? emptyDraft(now()),
      restored: stored !== null && hasContent(stored),
      savedAt: stored ? Date.parse(stored.updatedAt) : null,
      update: (patch) => {
        const current = get().draft;
        const changes = typeof patch === 'function' ? patch(current) : patch;
        set({ draft: { ...current, ...changes, updatedAt: now().toISOString() } });
        if (timer) clearTimeout(timer);
        timer = setTimeout(write, saveMs);
      },
      keep: () => set({ restored: false }),
      reset: () => {
        if (timer) clearTimeout(timer);
        timer = null;
        storage.remove();
        set({ draft: emptyDraft(now()), restored: false, savedAt: null });
      },
      flush: () => {
        if (timer) write();
      },
    };
  });
}

let appStore: StoreApi<DraftState> | undefined;

export function getDraftStore(): StoreApi<DraftState> {
  if (!appStore) {
    const kv = getStorage();
    appStore = createDraftStore({
      get: () => kv.get('sell.draft'),
      set: (value) => kv.set('sell.draft', value),
      remove: () => kv.remove('sell.draft'),
    });
  }
  return appStore;
}

/** The app's draft; saves right away when the app goes to the background. */
export function useDraft<T>(
  selector: (s: DraftState) => T,
  store: StoreApi<DraftState> = getDraftStore(),
): T {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') store.getState().flush();
    });
    return () => sub.remove();
  }, [store]);
  return useStore(store, selector);
}
