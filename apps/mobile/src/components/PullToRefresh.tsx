import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, type RefreshControlProps } from 'react-native';

type Props = Omit<RefreshControlProps, 'refreshing' | 'onRefresh'> & {
  onRefresh: () => Promise<unknown>;
};

/**
 * Pull to refresh that spins only while the person's own pull is loading.
 * Lists used to pass `query.isRefetching`, so every background refresh (tab
 * focus, realtime pings) showed the spinner at the top, and the Inbox looked
 * like it never finished loading (owner device check, 2026-10-25).
 */
export function PullToRefresh({ onRefresh, ...rest }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const pull = useCallback(() => {
    setRefreshing(true);
    void Promise.resolve()
      .then(onRefresh)
      .catch(() => undefined)
      .finally(() => {
        if (alive.current) setRefreshing(false);
      });
  }, [onRefresh]);
  return <RefreshControl {...rest} refreshing={refreshing} onRefresh={pull} />;
}
