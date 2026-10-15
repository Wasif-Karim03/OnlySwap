import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { IconButton } from '@/components/IconButton';

import { unreadCount } from './api';

/** Under ['notifications'], so marking read on the list refreshes the badge too. */
export const unreadKey = ['notifications', 'unread'] as const;

/**
 * Unread notifications for the bell. Fetched when a screen with a bell comes
 * into focus, when the app returns to the foreground (focusManager) and when
 * a push arrives while the app is open (usePushHandling). No polling.
 */
export function useUnreadCount(fetch: () => Promise<number> = unreadCount): number {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: unreadKey, queryFn: fetch, staleTime: 15_000 });
  useFocusEffect(
    useCallback(() => {
      void qc.invalidateQueries({ queryKey: unreadKey });
    }, [qc]),
  );
  return q.data ?? 0;
}

type Props = {
  accessibilityLabel: string;
  filled?: boolean;
  surface?: 'bg2' | 'card';
  testID?: string;
  fetch?: () => Promise<number>;
};

/** The header bell (F09) with its unread count (owner, 2026-10-15; DEC 120). */
export function NotificationBell({ accessibilityLabel, filled, surface, testID, fetch }: Props) {
  const router = useRouter();
  const count = useUnreadCount(fetch);
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
