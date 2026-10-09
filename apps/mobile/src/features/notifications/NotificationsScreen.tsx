import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { SectionList, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/icons/Icon';
import { NavBar } from '@/components/NavBar';
import { Photo } from '@/components/Photo';
import { SkeletonList } from '@/components/Skeleton';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { getEnv } from '@/lib/env';
import { routeForNotification, setBadge } from '@/lib/push';
import { intlLocale, notificationsScreen as copy } from '@/strings';

import { feedApi, type FeedApi } from '../feed/api';
import { listingKey } from '../feed/ListingScreen';
import { isVisible } from '../feed/logic';
import { DealAvatar } from '../offers/DealAvatar';
import { shortAgo } from '../offers/logic';
import { mediaUrl } from '../sell/logic';
import { daySection, notificationsApi, type AppNotification, type NotificationsApi } from './api';
import { notificationActor, notificationGlyph, notificationListingId } from './logic';

export const notificationsKey = ['notifications'] as const;

/**
 * The row's picture (DEC 90): the item's photo when the notification is about
 * a listing, else the other person's initial, else a quiet glyph. The listing
 * is read through the same cache as the listing screen, so opening it is
 * instant afterwards.
 */
function NotificationVisual({
  n,
  listings,
  mediaBase,
}: {
  n: AppNotification;
  listings: Pick<FeedApi, 'getListing'>;
  mediaBase: () => string;
}) {
  const listingId = notificationListingId(n);
  const listing = useQuery({
    queryKey: listingKey(listingId ?? ''),
    queryFn: () => listings.getListing(listingId as string),
    enabled: listingId !== null,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const data = listing.data;
  const thumb = data && isVisible(data) ? data.photos[0]?.thumb_path : undefined;
  if (listingId && thumb) {
    return (
      <View style={styles.thumb} testID={`notification-${n.id}-photo`}>
        <Photo source={mediaUrl(mediaBase(), thumb)} fill />
      </View>
    );
  }
  const actor = notificationActor(n);
  if (actor) {
    return (
      <View testID={`notification-${n.id}-person`}>
        <DealAvatar name={actor} />
      </View>
    );
  }
  return (
    <View style={styles.glyph} testID={`notification-${n.id}-glyph`}>
      <Icon name={notificationGlyph(n)} size={16} tone="ink2" />
    </View>
  );
}

/**
 * F09 Notifications (P9-NOTIF-01; X36 empty; DEC 90 mock screen 16): large
 * title, Today / Yesterday / Earlier, each row with the item photo or the
 * person's initial, the title in bold, the time under it and a dot when
 * unread. Tap to open.
 */
export function NotificationsScreen({
  api = notificationsApi,
  listings = feedApi,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  now = () => new Date(),
  badge = setBadge,
}: {
  api?: NotificationsApi;
  listings?: Pick<FeedApi, 'getListing'>;
  mediaBase?: () => string;
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
          stickySectionHeadersEnabled={false}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          renderSectionHeader={({ section }) => (
            <Text variant="label" tone="ink3" accessibilityRole="header" style={styles.section}>
              {section.title}
            </Text>
          )}
          renderItem={({ item: n }) => {
            const when = shortAgo(n.created_at, t, intlLocale);
            return (
              <Tappable
                accessibilityRole="button"
                accessibilityLabel={`${n.read ? '' : `${copy.unread}. `}${n.title}. ${n.body}. ${when}`}
                onPress={() => void open(n)}
                testID={`notification-${n.id}`}
              >
                <View style={styles.row}>
                  <NotificationVisual n={n} listings={listings} mediaBase={mediaBase} />
                  <View style={styles.flex}>
                    <Text variant="label">{n.title}</Text>
                    <Text variant="label" tone="ink2" style={styles.regular}>
                      {n.body}
                    </Text>
                    <Text variant="meta" tone="ink3" style={styles.when}>
                      {when}
                    </Text>
                  </View>
                  <View
                    style={styles.dot(!n.read)}
                    testID={n.read ? undefined : `notification-${n.id}-unread`}
                  />
                </View>
              </Tappable>
            );
          }}
          testID="notifications-list"
        />
      );
    }
  }

  return (
    <View style={styles.root} testID="screen-notifications">
      <NavBar
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
      <Text variant="display" accessibilityRole="header" style={styles.title}>
        {copy.title}
      </Text>
      {body}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  list: { paddingHorizontal: theme.space.screen, paddingBottom: theme.space['2xl'] },
  title: { paddingHorizontal: theme.space.screen, paddingBottom: theme.space.xs },
  section: {
    paddingTop: theme.space.lg,
    paddingBottom: theme.space.xs,
    backgroundColor: theme.colors.bg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.md,
    paddingVertical: theme.space.md,
    minHeight: theme.space.rowMin,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  thumb: {
    width: theme.size.avatarS,
    height: theme.size.avatarS,
    borderRadius: theme.radius.thumb - theme.space.xs,
    overflow: 'hidden',
    backgroundColor: theme.colors.bg2,
  },
  glyph: {
    width: theme.size.avatarS,
    height: theme.size.avatarS,
    borderRadius: theme.radius.avatar,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg2,
  },
  // Unread: a small ink dot on the right (the accent is a fill, never a signal on white).
  dot: (on: boolean) => ({
    width: theme.space.sm,
    height: theme.space.sm,
    marginTop: theme.space.sm,
    borderRadius: theme.radius.chip,
    backgroundColor: on ? theme.colors.ink : 'transparent',
  }),
  flex: { flex: 1, gap: theme.space.xs / 2 },
  regular: { fontWeight: '400' },
  when: { marginTop: theme.space.xs / 2 },
}));
