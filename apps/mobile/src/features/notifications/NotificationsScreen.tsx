import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { SectionList, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { NavBar } from '@/components/NavBar';
import { SkeletonList } from '@/components/Skeleton';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { routeForNotification, setBadge } from '@/lib/push';
import { notificationsScreen as copy } from '@/strings/en';

import { daySection, notificationsApi, type AppNotification, type NotificationsApi } from './api';

export const notificationsKey = ['notifications'] as const;

/** F09 Notifications (P9-NOTIF-01; X36 empty): by day, unread marked, tap to open. */
export function NotificationsScreen({
  api = notificationsApi,
  now = () => new Date(),
  badge = setBadge,
}: {
  api?: NotificationsApi;
  now?: () => Date;
  badge?: (n: number) => Promise<void>;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: notificationsKey,
    queryFn: ({ pageParam }) => api.list(pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) =>
      last.items.length < 30 ? undefined : last.items[last.items.length - 1]!.id,
  });
  const unread = q.data?.pages[0]?.unread ?? 0;
  useEffect(() => {
    if (q.data) void badge(unread);
  }, [q.data, unread, badge]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/inbox'));
  const markAll = async () => {
    await api.markRead(null);
    await qc.invalidateQueries({ queryKey: notificationsKey });
  };
  const open = async (n: AppNotification) => {
    if (!n.read)
      void api.markRead([n.id]).then(() => qc.invalidateQueries({ queryKey: notificationsKey }));
    const href = routeForNotification({ ...n.data, type: n.type });
    if (href) router.push(href);
  };

  let body;
  if (q.isPending) body = <SkeletonList />;
  else if (q.isError) body = <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  else {
    const items = q.data.pages.flatMap((p) => p.items);
    if (items.length === 0) {
      body = (
        <EmptyState
          icon="bell"
          title={copy.emptyTitle}
          body={copy.emptyBody}
          testID="notifications-empty"
        />
      );
    } else {
      const t = now();
      const sections = (['today', 'yesterday', 'earlier'] as const)
        .map((k) => ({
          key: k,
          title: copy[k],
          data: items.filter((n) => daySection(n.created_at, t) === k),
        }))
        .filter((s) => s.data.length);
      body = (
        <SectionList
          sections={sections}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={styles.list}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          renderSectionHeader={({ section }) => (
            <Text variant="label" tone="ink2" accessibilityRole="header" style={styles.section}>
              {section.title}
            </Text>
          )}
          renderItem={({ item: n }) => (
            <Tappable
              accessibilityRole="button"
              accessibilityLabel={`${n.read ? '' : `${copy.unread}. `}${n.title}. ${n.body}`}
              onPress={() => void open(n)}
              testID={`notification-${n.id}`}
            >
              <View style={styles.row}>
                <View style={styles.dot(!n.read)} />
                <View style={styles.flex}>
                  <Text variant={n.read ? 'body' : 'bodyStrong'}>{n.title}</Text>
                  <Text variant="meta" tone="ink2">
                    {n.body}
                  </Text>
                </View>
              </View>
            </Tappable>
          )}
          testID="notifications-list"
        />
      );
    }
  }

  return (
    <View style={styles.root} testID="screen-notifications">
      <NavBar
        title={copy.title}
        onLeading={leave}
        trailing={
          unread > 0 ? (
            <Button
              label={copy.markAll}
              variant="text"
              size="S"
              onPress={markAll}
              testID="notifications-mark-all"
            />
          ) : undefined
        }
      />
      {body}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  list: { paddingHorizontal: theme.space.screen, paddingBottom: theme.space['2xl'] },
  section: {
    paddingTop: theme.space.lg,
    paddingBottom: theme.space.xs,
    backgroundColor: theme.colors.bg,
  },
  row: {
    flexDirection: 'row',
    gap: theme.space.md,
    paddingVertical: theme.space.md,
    minHeight: theme.space.rowMin,
  },
  dot: (on: boolean) => ({
    width: theme.space.sm,
    height: theme.space.sm,
    marginTop: theme.space.sm,
    borderRadius: theme.radius.chip,
    backgroundColor: on ? theme.colors.accent : 'transparent',
  }),
  flex: { flex: 1 },
}));
