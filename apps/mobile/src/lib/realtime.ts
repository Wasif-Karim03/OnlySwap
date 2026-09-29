import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { getSupabase } from './supabase';

/** What we need from supabase-js Realtime, so tests can pass a fake. */
export type RealtimeSource = {
  userId: () => Promise<string | null>;
  subscribe: (topic: string, event: string, onEvent: (payload: unknown) => void) => () => void;
};

export const supabaseRealtime: RealtimeSource = {
  userId: async () => (await getSupabase().auth.getSession()).data.session?.user.id ?? null,
  subscribe: (topic, event, onEvent) => {
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
        .on('broadcast', { event }, (msg) => onEvent(msg.payload))
        .subscribe();
    })();
    return () => {
      stopped = true;
      if (channel) void sb.removeChannel(channel);
    };
  },
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
