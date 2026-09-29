import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { toAppError } from '@/lib/errors';
import { supabaseRealtime, type RealtimeSource } from '@/lib/realtime';
import { uuid as newUuid } from '@/lib/uuid';

import { chatApi, type ChatApi } from './api';
import { firstSentId, lastSentId, mergeMessages, type ChatItem, type Message } from './logic';

export const PAGE = 50;

export type ChatState = {
  items: ChatItem[];
  loading: boolean;
  error: unknown;
  hasOlder: boolean;
  load: () => Promise<void>;
  loadOlder: () => Promise<void>;
  receive: (m: Message) => void;
  /** After a reconnect: everything since the last message we have. */
  catchUp: () => Promise<void>;
  send: (body: string) => Promise<void>;
  retry: (clientId: string) => Promise<void>;
  /** Sends queued messages in the order they were written. */
  flushPending: () => Promise<void>;
};

type Deps = {
  api: Pick<ChatApi, 'messages' | 'send'>;
  me: () => string | null;
  uuid?: () => string;
  now?: () => Date;
};

/** The chat store (P8-CHAT-02; T-UNIT-CHAT-01/02). One per open chat. */
export function createChatStore(chatId: string, deps: Deps): StoreApi<ChatState> {
  const uuid = deps.uuid ?? newUuid;
  const now = deps.now ?? (() => new Date());
  let flushing: Promise<void> | null = null;

  return createStore<ChatState>((set, get) => {
    const merge = (incoming: Message[]) =>
      set({ items: mergeMessages(get().items, incoming, deps.me()) });
    const setLocal = (clientId: string, state: 'pending' | 'failed') =>
      set({
        items: get().items.map((m) =>
          m.state !== 'sent' && m.client_id === clientId ? { ...m, state } : m,
        ),
      });

    /** true = sent; false = still offline (kept pending); failed ones are marked. */
    const attempt = async (clientId: string, body: string): Promise<boolean> => {
      try {
        const m = await deps.api.send(chatId, body, clientId);
        merge([m]);
        return true;
      } catch (e) {
        if (toAppError(e).code === 'ERR_OFFLINE') {
          setLocal(clientId, 'pending');
          return false;
        }
        setLocal(clientId, 'failed');
        return true;
      }
    };

    return {
      items: [],
      loading: true,
      error: null,
      hasOlder: false,
      load: async () => {
        set({ loading: true, error: null });
        try {
          const page = await deps.api.messages(chatId, { limit: PAGE });
          set({ hasOlder: page.length >= PAGE });
          merge(page);
          set({ loading: false });
        } catch (e) {
          set({ loading: false, error: e });
        }
      },
      loadOlder: async () => {
        const before = firstSentId(get().items);
        if (before === null || !get().hasOlder) return;
        const page = await deps.api.messages(chatId, { before, limit: PAGE });
        set({ hasOlder: page.length >= PAGE });
        merge(page);
      },
      receive: (m) => {
        if (m.chat_id === chatId) merge([m]);
      },
      catchUp: async () => {
        const after = lastSentId(get().items);
        if (after === null) return get().load();
        try {
          merge(await deps.api.messages(chatId, { after, limit: 100 }));
        } catch {
          // Next reconnect tries again.
        }
      },
      send: async (body) => {
        const text = body.trim();
        if (!text) return;
        const clientId = uuid();
        const item: ChatItem = {
          state: 'pending',
          id: null,
          client_id: clientId,
          body: text,
          kind: 'text',
          created_at: now().toISOString(),
          mine: true,
          sender_id: null,
          meta: null,
          chat_id: chatId,
        };
        set({ items: [...get().items, item] });
        // Keep the order: if older messages are still queued, send through the queue.
        const queuedBefore = get().items.some(
          (m) => m.state === 'pending' && m.client_id !== clientId,
        );
        if (queuedBefore) return get().flushPending();
        await attempt(clientId, text);
      },
      retry: async (clientId) => {
        const m = get().items.find((x) => x.state === 'failed' && x.client_id === clientId);
        if (!m || m.state === 'sent') return;
        setLocal(clientId, 'pending');
        await attempt(clientId, m.body ?? '');
      },
      flushPending: async () => {
        if (flushing) return flushing;
        flushing = (async () => {
          for (;;) {
            const next = get().items.find((m) => m.state === 'pending');
            if (!next || next.state === 'sent') break;
            const ok = await attempt(next.client_id!, next.body ?? '');
            if (!ok) break; // still offline: keep the rest in order
          }
        })();
        try {
          await flushing;
        } finally {
          flushing = null;
        }
      },
    };
  });
}

const stores = new Map<string, StoreApi<ChatState>>();

/**
 * useChat: subscribes to `chat:{id}` while focused, catches up on reconnect,
 * sends queued messages when the network comes back, marks the chat read.
 */
export function useChat(
  chatId: string,
  {
    me,
    api = chatApi,
    realtime = supabaseRealtime,
    store: injected,
  }: {
    me: string | null;
    api?: ChatApi;
    realtime?: RealtimeSource;
    store?: StoreApi<ChatState>;
  },
) {
  const store = useMemo(() => {
    if (injected) return injected;
    let s = stores.get(chatId);
    if (!s) {
      s = createChatStore(chatId, { api, me: () => me });
      stores.set(chatId, s);
    }
    return s;
  }, [injected, chatId, api, me]);
  const state = useStore(store);

  useEffect(() => {
    void store.getState().load();
  }, [store]);

  useFocusEffect(
    useCallback(() => {
      const stop = realtime.subscribe(`chat:${chatId}`, 'message', (payload) => {
        store.getState().receive(payload as Message);
        void api.markRead(chatId).catch(() => {});
      });
      // Coming back to the screen: anything missed while away.
      if (store.getState().items.length) void store.getState().catchUp();
      void api.markRead(chatId).catch(() => {});
      const net = NetInfo.addEventListener((s) => {
        if (s.isConnected) {
          void store.getState().catchUp();
          void store.getState().flushPending();
        }
      });
      return () => {
        stop();
        net();
      };
    }, [chatId, realtime, store, api]),
  );

  return state;
}
