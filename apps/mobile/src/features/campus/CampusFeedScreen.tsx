import { FlashList } from '@shopify/flash-list';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, Share, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { StoreApi } from 'zustand';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Icon, type IconName } from '@/components/icons/Icon';
import { IconButton } from '@/components/IconButton';
import { SkeletonList } from '@/components/Skeleton';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { useToastStore } from '@/components/Toast';
import { track as trackActivity } from '@/lib/activity';
import { getEnv } from '@/lib/env';
import { fill } from '@/lib/format';
import { campus as copy, feed as feedCopy } from '@/strings';
import { feedColumn } from '@/theme/layout';

import { feedApi, type FeedApi } from '../feed/api';
import type { FeedCursor } from '../feed/logic';
import { meApi, type Me } from '../me/api';
import { meKey } from '../me/MeScreens';
import { answerWanted, getDraftStore, type DraftState } from '../sell/draft';
import { listingLink, mediaUrl, priceLabel } from '../sell/logic';
import { campusApi, campusKeys, type CampusApi } from './api';
import { CampusCard } from './CampusCards';
import { FeedPost } from './FeedPost';
import {
  CAMPUS_FILTERS,
  dayOneBody,
  foundingState,
  isCampusFilter,
  mergeCampusPages,
  type CampusFilter,
  type CampusItem,
  type CampusPage,
} from './logic';
import { NotificationBell } from '@/features/notifications/NotificationBell';

const FILTER_ICON: Partial<Record<CampusFilter, IconName>> = { food: 'food', free: 'gift' };

type Deps = {
  api?: CampusApi;
  saves?: Pick<FeedApi, 'save' | 'unsave'>;
  store?: StoreApi<DraftState>;
  mediaBase?: () => string;
  site?: () => string;
  share?: (content: { message: string; url?: string }) => Promise<unknown>;
  openUrl?: (url: string) => Promise<unknown>;
  now?: () => Date;
  /** The signed-in student, for the campus name and the composer avatar. */
  loadMe?: () => Promise<Me>;
};

/**
 * C01 Feed tab (DEC 98, was Around campus on Discover): one post per row like
 * a social feed. News, free food, free stuff, Wanted posts and the last week's
 * listings, newest first, with "What's happening on campus?" to post news, the
 * Day one hero and the founding sellers card while the campus is new.
 */
export function CampusFeedScreen({
  api = campusApi,
  saves = feedApi,
  store = getDraftStore(),
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  site = () => getEnv().EXPO_PUBLIC_SITE_URL,
  share = (content) => Share.share(content),
  openUrl = (url) => Linking.openURL(url),
  now = () => new Date(),
  loadMe = () => meApi.me(),
}: Deps) {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ kind?: string }>();
  const [kind, setKind] = useState<CampusFilter>(isCampusFilter(params.kind) ? params.kind : 'all');
  // A post screen's "See the Feed" can ask for a filter while the tab is already open.
  const [seenKind, setSeenKind] = useState(params.kind);
  if (params.kind !== seenKind) {
    setSeenKind(params.kind);
    if (isCampusFilter(params.kind)) setKind(params.kind);
  }
  const me = useQuery({ queryKey: meKey, queryFn: loadMe, staleTime: 5 * 60_000 });

  const q = useInfiniteQuery({
    queryKey: campusKeys.feed(kind),
    queryFn: ({ pageParam }) => api.feed(kind, pageParam),
    initialPageParam: null as FeedCursor | null,
    getNextPageParam: (last: CampusPage) => last.next_cursor ?? undefined,
    // A refetch reloads every page scrolled so far, so not on every return to
    // the app (E-20). Pull to refresh still reloads at once.
    staleTime: 2 * 60_000,
  });

  const base = mediaBase();
  const open = (item: CampusItem) =>
    router.push({ pathname: '/listing/[id]', params: { id: item.id, from: 'campus' } });
  const answer = (item: CampusItem) => {
    answerWanted(store, item);
    router.push('/sell');
  };
  const postNews = () => router.push('/sell/news');
  const postFood = () => router.push('/sell/food');
  const askFor = () => router.push('/sell/wanted');
  const sell = () => router.push('/sell');

  // Saved shows at once on every cached Feed filter; put back if the call fails.
  const patchItem = (id: string, patch: Partial<CampusItem>) =>
    qc.setQueriesData<InfiniteData<CampusPage>>({ queryKey: campusKeys.all }, (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((p) => ({
              ...p,
              items: p.items.map((x) => (x.id === id ? { ...x, ...patch } : x)),
            })),
          }
        : old,
    );
  const toggleSave = async (item: CampusItem) => {
    const was = item.saved;
    patchItem(item.id, { saved: !was });
    try {
      const n = was ? await saves.unsave(item.id) : await saves.save(item.id);
      patchItem(item.id, { saved: !was, save_count: n });
      if (was) trackActivity('unsaved', { listingId: item.id, source: 'campus' });
    } catch {
      patchItem(item.id, { saved: was });
      useToastStore.getState().show('error', copy.saveFailed);
    }
  };
  const onShare = async (item: CampusItem) => {
    const url = listingLink(site(), item.id);
    const text =
      item.kind === 'news'
        ? item.title
        : fill(feedCopy.shareMessage, {
            title: item.title,
            price: priceLabel(item.kind, item.price_cents, feedCopy.free),
          });
    await share(Platform.OS === 'ios' ? { message: text, url } : { message: `${text} ${url}` });
  };

  const meData = me.data;
  const myName = meData?.display_name ?? '';
  const myAvatar = meData?.avatar_path ? mediaUrl(base, meData.avatar_path) : null;

  const header = (
    <>
      <View style={styles.top} testID="feed-header">
        <View style={styles.flex}>
          {meData?.campus?.short_name ? (
            <Text variant="meta" tone="ink3" numberOfLines={1} testID="feed-campus">
              {meData.campus.short_name}
            </Text>
          ) : null}
          <Text variant="title" accessibilityRole="header" numberOfLines={1}>
            {copy.title}
          </Text>
        </View>
        <IconButton
          icon="search"
          filled
          surface="card"
          accessibilityLabel={feedCopy.search}
          onPress={() => router.push('/search')}
          testID="feed-search"
        />
        <NotificationBell
          filled
          surface="card"
          accessibilityLabel={feedCopy.notifications}
          testID="feed-notifications"
        />
      </View>
      {/*
        A horizontal ScrollView grows to fill a column by default; flexGrow 0
        keeps the chip row to its own height (DEC 90 fix).
      */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chips}
        accessibilityLabel={copy.filtersLabel}
        testID="campus-filters"
      >
        {CAMPUS_FILTERS.map((f) => (
          <Chip
            key={f}
            label={copy.filters[f]}
            icon={FILTER_ICON[f]}
            surface="card"
            selected={kind === f}
            onPress={() => setKind(f)}
          />
        ))}
      </ScrollView>
    </>
  );

  const renderItem = (item: CampusItem) =>
    item.kind === 'food' || item.kind === 'wanted' ? (
      <CampusCard
        item={item}
        now={now}
        mediaBase={base}
        onOpen={() => open(item)}
        onAnswer={() => answer(item)}
        testID={`campus-item-${item.id}`}
      />
    ) : (
      <FeedPost
        item={item}
        now={now}
        mediaBase={base}
        onOpen={() => open(item)}
        onSave={() => void toggleSave(item)}
        onOffer={() => router.push({ pathname: '/listing/[id]/offer', params: { id: item.id } })}
        onShare={() => void onShare(item)}
        onOpenLink={(url) => void openUrl(url)}
        testID={`campus-item-${item.id}`}
      />
    );

  let body;
  if (q.isPending) {
    body = (
      <View accessibilityLabel={copy.loading} style={styles.pad}>
        <SkeletonList rows={4} testID="campus-loading" />
      </View>
    );
  } else if (q.isError && !q.data) {
    body = <ErrorState error={q.error} onRetry={() => q.refetch()} testID="campus-error" />;
  } else {
    const pages = q.data?.pages ?? [];
    const first = pages[0];
    const items = mergeCampusPages(pages);
    const founding = foundingState(first?.founding);
    body = (
      <FlashList
        data={items}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.list}
        refreshing={q.isRefetching && !q.isFetchingNextPage}
        onRefresh={() => void q.refetch()}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ItemSeparatorComponent={Gap}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.composer}>
              <Avatar name={myName} uri={myAvatar} size="M" />
              <Tappable
                accessibilityRole="button"
                accessibilityLabel={copy.composerLabel}
                onPress={postNews}
                style={styles.flex}
                testID="feed-composer"
              >
                <View style={styles.composerField}>
                  <Text variant="body" tone="ink3" numberOfLines={1}>
                    {copy.composer}
                  </Text>
                </View>
              </Tappable>
            </View>
            <View style={styles.row}>
              <PostPill
                icon="food"
                label={copy.postFood}
                onPress={postFood}
                testID="campus-post-food"
              />
              <PostPill icon="plus" label={copy.askFor} onPress={askFor} testID="campus-ask" />
            </View>
            {first?.day_one && kind === 'all' ? (
              <View style={styles.panel} testID="campus-day-one">
                <Text variant="heading" accessibilityRole="header">
                  {copy.dayOneTitle}
                </Text>
                <Text variant="body" tone="ink2">
                  {dayOneBody(first.active_listings ?? 0)}
                </Text>
                <Button label={copy.dayOneAction} size="M" onPress={sell} />
              </View>
            ) : null}
            {founding && kind === 'all' ? (
              <View style={styles.panel} testID={`campus-founding-${founding}`}>
                <Text variant="bodyStrong" accessibilityRole="header">
                  {founding === 'mine' ? copy.foundingMineTitle : copy.foundingTitle}
                </Text>
                <Text variant="meta" tone="ink2">
                  {founding === 'mine'
                    ? copy.foundingMineBody
                    : fill(copy.foundingBody, {
                        left: first?.founding?.left ?? 0,
                        limit: first?.founding?.limit ?? 0,
                      })}
                </Text>
                {founding === 'open' && !first?.day_one ? (
                  <Button
                    label={copy.foundingAction}
                    variant="secondary"
                    size="S"
                    fullWidth={false}
                    onPress={sell}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={
              kind === 'food'
                ? 'food'
                : kind === 'wanted'
                  ? 'search'
                  : kind === 'news'
                    ? 'users'
                    : 'gift'
            }
            title={copy.empty[kind].title}
            body={copy.empty[kind].body}
            action={
              kind === 'food'
                ? { label: copy.postFood, onPress: postFood }
                : kind === 'wanted'
                  ? { label: copy.askFor, onPress: askFor }
                  : kind === 'news'
                    ? { label: copy.postNews, onPress: postNews }
                    : { label: copy.dayOneAction, onPress: sell }
            }
            testID={`campus-empty-${kind}`}
          />
        }
        ListFooterComponent={
          q.isFetchingNextPage ? (
            <View style={styles.more} accessibilityLabel={copy.loadingMore}>
              <ActivityIndicator />
            </View>
          ) : null
        }
        renderItem={({ item }) => renderItem(item)}
        testID="campus-feed"
      />
    );
  }

  return (
    <View style={styles.root} testID="screen-campus">
      <View style={feedColumn}>
        {header}
        {body}
      </View>
    </View>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

/** "Post free food" and "Ask for something": quiet white pills, not main actions. */
function PostPill({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.flex}
      testID={testID}
    >
      <View style={styles.pill}>
        <Icon name={icon} size={18} />
        <Text variant="label" numberOfLines={2} style={styles.pillText}>
          {label}
        </Text>
      </View>
    </Tappable>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  // Grey page, white cards (DEC 90 mock screen 5).
  root: { flex: 1, backgroundColor: theme.colors.bg2 },
  row: { flexDirection: 'row', gap: theme.space.sm },
  flex: { flex: 1 },
  pad: { padding: theme.space.screen },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingTop: rt.insets.top + theme.space.sm,
    paddingBottom: theme.space.md,
    paddingHorizontal: theme.space.screen,
  },
  chipRow: { flexGrow: 0, flexShrink: 0 },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.xs,
    paddingBottom: theme.space.md,
  },
  list: { paddingHorizontal: theme.space.screen, paddingBottom: theme.space['2xl'] },
  listHeader: { gap: theme.space.md, paddingBottom: theme.space.md },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    padding: theme.space.md,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.card,
  },
  composerField: {
    minHeight: theme.size.hit,
    justifyContent: 'center',
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.bg2,
  },
  panel: {
    gap: theme.space.sm,
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.card,
  },
  pill: {
    minHeight: theme.size.hit,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.xs,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.card,
  },
  pillText: { flexShrink: 1, textAlign: 'center' },
  gap: { height: theme.space.md },
  more: { paddingVertical: theme.space.lg, alignItems: 'center' },
}));
