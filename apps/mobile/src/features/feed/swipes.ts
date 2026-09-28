import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { createStore, type StoreApi } from 'zustand';

import { getStorage } from '@/lib/storage';

import type { FeedApi } from './api';
import type { SwipeDir } from './deckMath';
import {
  BATCH_MAX,
  enqueue,
  parseQueue,
  shouldFlush,
  toServer,
  undoPlan,
  type QueuedSwipe,
} from './logic';

/**
 * Swipe batching (P6-FEED-03, T-UNIT-FEED-01). Swipes queue locally (kept in
 * MMKV, newest 200) and go to `record_swipes` at 10, when Discover loses
 * focus, when the app goes to the background and when the network comes
 * back. Undo within 5 s drops a pending swipe or calls `undo_swipe`.
 */
export type SwipeState = {
  queue: QueuedSwipe[];
  last: QueuedSwipe | null;
  swipe: (listingId: string, dir: SwipeDir) => void;
  flush: () => Promise<void>;
  /** The listing id to put back on the deck, or null when undo isn't possible. */
  undo: () => Promise<string | null>;
};

type QueueStorage = { get: () => unknown; set: (q: QueuedSwipe[]) => void };

export function createSwipeStore(
  storage: QueueStorage,
  api: Pick<FeedApi, 'recordSwipes' | 'undoSwipe'>,
  now: () => Date = () => new Date(),
): StoreApi<SwipeState> {
  let inflight: Promise<void> | null = null;
  return createStore<SwipeState>((set, get) => {
    const save = (queue: QueuedSwipe[]) => {
      set({ queue });
      storage.set(queue);
    };
    const flush = async (): Promise<void> => {
      if (inflight) return inflight;
      const batch = get().queue.slice(0, BATCH_MAX);
      if (batch.length === 0) return;
      inflight = (async () => {
        try {
          await api.recordSwipes(batch.map(toServer));
          const sent = new Set(batch.map((b) => `${b.listing_id}@${b.at}`));
          save(get().queue.filter((q) => !sent.has(`${q.listing_id}@${q.at}`)));
        } catch {
          // Offline or failing: keep the queue for the next trigger.
        } finally {
          inflight = null;
        }
      })();
      await inflight;
      if (shouldFlush(get().queue)) await flush();
    };
    return {
      queue: parseQueue(storage.get()),
      last: null,
      swipe: (listingId, dir) => {
        const s: QueuedSwipe = { listing_id: listingId, dir, at: now().toISOString() };
        save(enqueue(get().queue, s));
        set({ last: s });
        if (shouldFlush(get().queue)) void flush();
      },
      flush,
      undo: async () => {
        const { last, queue } = get();
        const plan = undoPlan(queue, last, now());
        set({ last: null });
        if (plan.kind === 'expired' || !last) return null;
        if (plan.kind === 'local') {
          save(plan.queue);
          return last.listing_id;
        }
        try {
          await api.undoSwipe(last.listing_id);
          return last.listing_id;
        } catch {
          return null;
        }
      },
    };
  });
}

let appStore: StoreApi<SwipeState> | undefined;

export function getSwipeStore(
  api: Pick<FeedApi, 'recordSwipes' | 'undoSwipe'>,
): StoreApi<SwipeState> {
  if (!appStore) {
    appStore = createSwipeStore(
      {
        get: () => getStorage().get('feed.swipeQueue'),
        set: (q) => getStorage().set('feed.swipeQueue', q),
      },
      api,
    );
  }
  return appStore;
}

/** Flush triggers: screen blur, app background, network back. */
export function useSwipeFlush(store: StoreApi<SwipeState>) {
  useFocusEffect(
    useCallback(() => {
      void store.getState().flush();
      return () => void store.getState().flush();
    }, [store]),
  );
  useEffect(() => {
    const app = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void store.getState().flush();
    });
    const net = NetInfo.addEventListener((s) => {
      if (s.isConnected) void store.getState().flush();
    });
    return () => {
      app.remove();
      net();
    };
  }, [store]);
}
