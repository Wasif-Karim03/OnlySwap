import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { IconButton } from '@/components/IconButton';
import { setBadge } from '@/lib/push';
import { supabaseRealtime, useUserChannel, type RealtimeSource } from '@/lib/realtime';

import { unreadCount } from './api';

/** Under ['notifications'], so marking read on the list refreshes the badge too. */
export const unreadKey = ['notifications', 'unread'] as const;

/** Pings in a burst (a busy chat) refetch the count once. */
const PING_DEBOUNCE_MS = 400;

/**
 * Unread notifications for the bell. Fetched when a screen with a bell comes
 * into focus, when the app returns to the foreground (focusManager), when a
 * push arrives while the app is open (usePushHandling), and live while the
 * screen is open: the server pings `user:{uid}` with 'bell' for every new
 * notification (0234; likes have no push) and 'inbox' for messages and
 * offers. No polling. The app icon's number follows the same count.
 */
export function useUnreadCount(
  fetch: () => Promise<number> = unreadCount,
  realtime: RealtimeSource = supabaseRealtime,
  badge: (n: number) => Promise<void> = setBadge,
): number {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: unreadKey, queryFn: fetch, staleTime: 15_000 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void qc.invalidateQueries({ queryKey: unreadKey });
    }, PING_DEBOUNCE_MS);
  }, [qc]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useFocusEffect(
    useCallback(() => {
      void qc.invalidateQueries({ queryKey: unreadKey });
    }, [qc]),
  );
  useUserChannel('bell', refresh, realtime);
  useUserChannel('inbox', refresh, realtime);
  const count = q.data;
  useEffect(() => {
    if (count !== undefined) void badge(count);
  }, [count, badge]);
  return count ?? 0;
}

type Props = {
  accessibilityLabel: string;
  filled?: boolean;
  surface?: 'bg2' | 'card';
  testID?: string;
  fetch?: () => Promise<number>;
  realtime?: RealtimeSource;
  badge?: (n: number) => Promise<void>;
};

/** The header bell (F09) with its unread count (owner, 2026-10-15; DEC 120). */
export function NotificationBell({
  accessibilityLabel,
  filled,
  surface,
  testID,
  fetch,
  realtime,
  badge,
}: Props) {
  const router = useRouter();
  const count = useUnreadCount(fetch, realtime, badge);
  return (
    <IconButton
      icon="bell"
      filled={filled}
      surface={surface}
      accessibilityLabel={accessibilityLabel}
      badge={count}
      onPress={() => router.push('/notifications')}
      testID={testID}
    />
  );
}
