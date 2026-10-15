import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { getSupabase } from './supabase';

/** What we need from supabase-js Realtime, so tests can pass a fake. */
export type RealtimeSource = {
  userId: () => Promise<string | null>;
  /** `onJoin` runs when the channel comes back after the app was in the background. */
  subscribe: (
    topic: string,
    event: string,
    onEvent: (payload: unknown) => void,
    onJoin?: () => void,
  ) => () => void;
};

/** Opens one channel and hands every broadcast on it to `onBroadcast`; returns leave. */
export type Join = (
  topic: string,
  onBroadcast: (event: string, payload: unknown) => void,
) => () => void;

type Listener = { event: string; onEvent: (payload: unknown) => void; onJoin?: () => void };
type Entry = { listeners: Set<Listener>; leave: (() => void) | null };

/**
 * Shares one channel per topic between screens (the inbox and an open chat
 * both listen on `user:{uid}`), and leaves every channel while the app is in
 * the background so the socket closes (E-09: the free plan allows 200 at once).
 * On resume it rejoins and calls each `onJoin` so screens catch up.
 */
export function createRealtimeHub(join: Join) {
  const topics = new Map<string, Entry>();
  let active = true;

  const open = (topic: string, entry: Entry) => {
    entry.leave = join(topic, (event, payload) => {
      for (const l of [...entry.listeners]) if (l.event === event) l.onEvent(payload);
    });
  };

  return {
    subscribe(
      topic: string,
      event: string,
      onEvent: (payload: unknown) => void,
      onJoin?: () => void,
    ): () => void {
      let entry = topics.get(topic);
      if (!entry) {
        entry = { listeners: new Set(), leave: null };
        topics.set(topic, entry);
      }
      const listener: Listener = { event, onEvent, onJoin };
      entry.listeners.add(listener);
      if (active && !entry.leave) open(topic, entry);
      const mine = entry;
      return () => {
        if (!mine.listeners.delete(listener) || mine.listeners.size) return;
        mine.leave?.();
        mine.leave = null;
        if (topics.get(topic) === mine) topics.delete(topic);
      };
    },
    setActive(next: boolean) {
      if (next === active) return;
      active = next;
      for (const [topic, entry] of topics) {
        if (!next) {
          entry.leave?.();
          entry.leave = null;
        } else if (!entry.leave) {
          open(topic, entry);
          for (const l of [...entry.listeners]) l.onJoin?.();
        }
      }
    },
  };
}

const supabaseJoin: Join = (topic, onBroadcast) => {
  const sb = getSupabase();
  let channel: ReturnType<typeof sb.channel> | null = null;
  let stopped = false;
  // Private channels are authorized with the user's JWT. Hand Realtime the
  // current session token first: after a cold start the socket can connect
  // before the stored session loads and would join as anon (found on the
  // Simulator: the inbox never heard about an accepted offer).
  void (async () => {
    const token = (await sb.auth.getSession()).data.session?.access_token;
    if (token) await sb.realtime.setAuth(token);
    if (stopped) return;
    channel = sb
      .channel(topic, { config: { private: true } })
      .on('broadcast', { event: '*' }, (msg) => onBroadcast(msg.event, msg.payload))
      .subscribe();
  })();
  return () => {
    stopped = true;
    if (channel) void sb.removeChannel(channel);
  };
};

let hub: ReturnType<typeof createRealtimeHub> | null = null;
function sharedHub() {
  if (!hub) {
    const h = createRealtimeHub(supabaseJoin);
    AppState.addEventListener('change', (s) => {
      if (s === 'active') h.setActive(true);
      else if (s === 'background') h.setActive(false);
    });
    hub = h;
  }
  return hub;
}

export const supabaseRealtime: RealtimeSource = {
  userId: async () => (await getSupabase().auth.getSession()).data.session?.user.id ?? null,
  subscribe: (topic, event, onEvent, onJoin) =>
    sharedHub().subscribe(topic, event, onEvent, onJoin),
};

/**
 * Listens on the private `user:{uid}` channel while the screen is focused
 * (ADR-004; E01 "realtime user channel"). Private channels are authorized by
 * the realtime.messages policy, so nobody else can join.
 */
export function useUserChannel(
  event: string,
  onEvent: () => void,
  source: RealtimeSource = supabaseRealtime,
) {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);
  useFocusEffect(
    useCallback(() => {
      let stop: (() => void) | null = null;
      let alive = true;
      void source.userId().then((uid) => {
        if (!alive || !uid) return;
        stop = source.subscribe(`user:${uid}`, event, () => handler.current());
      });
      return () => {
        alive = false;
        stop?.();
      };
    }, [event, source]),
  );
}
