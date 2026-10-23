import { FlashList } from '@shopify/flash-list';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, Share, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { StoreApi } from 'zustand';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import type { IconName } from '@/components/icons/Icon';
import { IconButton } from '@/components/IconButton';
import { ActionSheet } from '@/components/Sheet';
import { SkeletonList } from '@/components/Skeleton';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { useToastStore } from '@/components/Toast';
import { track as trackActivity } from '@/lib/activity';
import { getEnv } from '@/lib/env';
import { fill } from '@/lib/format';
import { campus as copy, comments as commentCopy, feed as feedCopy, tabs } from '@/strings';
import { feedColumn } from '@/theme/layout';

import { commentsApi, type CommentsApi } from '../comments/api';
import { createLikeSender, toggleLike } from '../comments/logic';
import { feedApi, type FeedApi } from '../feed/api';
import type { FeedCursor } from '../feed/logic';
import { meApi, type Me } from '../me/api';
import { meKey } from '../me/MeScreens';
import { quadApi, type QuadApi } from '../quad/api';
import { useQuadStatus } from '../quad/cache';
import { QuadScreen } from '../quad/QuadFeedScreen';
import { answerWanted, getDraftStore, type DraftState } from '../sell/draft';
import { listingLink, mediaUrl, priceLabel } from '../sell/logic';
import { campusApi, campusKeys, type CampusApi } from './api';
import { CampusCard } from './CampusCards';
import { FeedPost } from './FeedPost';
import {
  CAMPUS_FILTERS,
  dayOneBody,
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
  likes?: Pick<CommentsApi, 'likePost'>;
  store?: StoreApi<DraftState>;
  mediaBase?: () => string;
  site?: () => string;
  share?: (content: { message: string; url?: string }) => Promise<unknown>;
  openUrl?: (url: string) => Promise<unknown>;
  now?: () => Date;
  /** The signed-in student, for the campus name and the composer avatar. */
  loadMe?: () => Promise<Me>;
  /** The Quad, shown as a Feed chip where the campus has it on (DEC 130). */
  quad?: QuadApi;
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
  likes = commentsApi,
  store = getDraftStore(),
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  site = () => getEnv().EXPO_PUBLIC_SITE_URL,
  share = (content) => Share.share(content),
  openUrl = (url) => Linking.openURL(url),
  now = () => new Date(),
  loadMe = () => meApi.me(),
  quad = quadApi,
}: Deps) {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ kind?: string }>();
  const [kind, setKind] = useState<CampusFilter>(isCampusFilter(params.kind) ? params.kind : 'all');
  // A post screen's "See the Feed" can ask for a filter while the tab is already open.
  // DEC 130: the Quad is a Feed chip (/feed?kind=quad), no longer a tab.
  const [inQuad, setInQuad] = useState(params.kind === 'quad');
  const [postMenu, setPostMenu] = useState(false);
  const [seenKind, setSeenKind] = useState(params.kind);
  if (params.kind !== seenKind) {
    setSeenKind(params.kind);
    if (isCampusFilter(params.kind)) {
      setKind(params.kind);
      setInQuad(false);
    } else if (params.kind === 'quad') setInQuad(true);
  }
  const quadStatus = useQuadStatus(quad);
  const quadOn = quadStatus.data?.enabled === true;
  const showQuad = inQuad && quadOn;
  // A cold /feed?kind=quad link waits on the Quad status instead of flashing All first.
  const quadPending = inQuad && quadStatus.isPending;
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
  // Likes show at once; the sender keeps one call per post in flight and the
  // server's count wins. A failure reloads the Feed to the true state.
  const likeSender = useRef(
    createLikeSender(
      (id, liked) => likes.likePost(id, liked),
      (id, res) => {
        if (res) patchItem(id, { liked: res.liked, like_count: res.like_count });
        else {
          useToastStore.getState().show('error', commentCopy.likeFailed);
          void qc.invalidateQueries({ queryKey: campusKeys.all });
        }
      },
    ),
  ).current;
  const toggleLikeItem = (item: CampusItem) => {
    const next = toggleLike({ liked: item.liked === true, count: item.like_count ?? 0 });
    patchItem(item.id, { liked: next.liked, like_count: next.count });
    likeSender(item.id, next.liked);
  };
  const openComments = (item: CampusItem) =>
    router.push({ pathname: '/listing/[id]/comments', params: { id: item.id } });
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

  const filterChip = (f: CampusFilter) => (
    <Chip
      key={f}
      label={copy.filters[f]}
      icon={FILTER_ICON[f]}
      surface="card"
      selected={!showQuad && !quadPending && kind === f}
      onPress={() => {
        setInQuad(false);
        setKind(f);
      }}
    />
  );

  const header = (
    <>
      <View style={styles.top} testID="feed-header">
        <Text variant="title" accessibilityRole="header" numberOfLines={1} style={styles.flex}>
          {copy.title}
        </Text>
        <IconButton
          icon="search"
          accessibilityLabel={feedCopy.search}
          onPress={() => router.push('/search')}
          testID="feed-search"
        />
        <NotificationBell accessibilityLabel={feedCopy.notifications} testID="feed-notifications" />
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
        {/* All, then the Quad (when on) where it is in view, then the rest. */}
        {CAMPUS_FILTERS.slice(0, 1).map(filterChip)}
        {quadOn ? (
          <Chip
            label={tabs.quad}
            icon="quad"
            surface="card"
            selected={showQuad}
            onPress={() => setInQuad(true)}
            testID="campus-filter-quad"
          />
        ) : null}
        {CAMPUS_FILTERS.slice(1).map(filterChip)}
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
        onLike={() => toggleLikeItem(item)}
        onComments={() => openComments(item)}
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
        onLike={() => toggleLikeItem(item)}
        onComments={() => openComments(item)}
        testID={`campus-item-${item.id}`}
      />
    );

  if (showQuad)
    return <QuadScreen api={quad} mediaBase={mediaBase} now={now} loadMe={loadMe} top={header} />;

  let body;
  if (quadPending || q.isPending) {
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
              <Tappable
                accessibilityRole="button"
                accessibilityLabel={copy.composerLabel}
                onPress={postNews}
                style={styles.flex}
                testID="feed-composer"
              >
                <View style={styles.composerTap}>
                  <Avatar name={myName} uri={myAvatar} size="M" />
                  <Text variant="body" tone="ink3" numberOfLines={1} style={styles.composerText}>
                    {copy.composer}
                  </Text>
                </View>
              </Tappable>
              <IconButton
                icon="plus"
                accessibilityLabel={copy.newPost}
                onPress={() => setPostMenu(true)}
                testID="feed-new-post"
              />
            </View>
            {first?.day_one && kind === 'all' ? (
              <View style={styles.dayOne} testID="campus-day-one">
                <Text variant="bodyStrong" accessibilityRole="header">
                  {copy.dayOneTitle}
                </Text>
                <Text variant="body" tone="ink2">
                  {dayOneBody(first.active_listings ?? 0)}
                </Text>
                <View style={styles.dayOneAction}>
                  <Button
                    label={copy.dayOneAction}
                    variant="text"
                    size="M"
                    fullWidth={false}
                    onPress={sell}
                  />
                </View>
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
      <ActionSheet
        visible={postMenu}
        onClose={() => setPostMenu(false)}
        actions={[
          { label: copy.postNews, onPress: postNews },
          { label: copy.postFood, onPress: postFood },
          { label: copy.askFor, onPress: askFor },
        ]}
      />
    </View>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create((theme, rt) => ({
  // One plain page, posts split by thin lines (owner feedback: simpler, like Apple's apps).
  root: { flex: 1, backgroundColor: theme.colors.bg },
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
  list: { paddingBottom: theme.space['2xl'] },
  listHeader: { gap: theme.space.md, paddingHorizontal: theme.space.screen },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingVertical: theme.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  composerTap: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  composerText: {
    flex: 1,
    minHeight: theme.size.hit,
    textAlignVertical: 'center',
    lineHeight: theme.size.hit,
  },
  // Day one is one plain row with a line under it, like the posts (no panel).
  dayOne: {
    gap: theme.space.xs,
    paddingBottom: theme.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  dayOneAction: { alignItems: 'flex-start' },
  gap: { height: 1, marginHorizontal: theme.space.screen, backgroundColor: theme.colors.line },
  more: { paddingVertical: theme.space.lg, alignItems: 'center' },
}));
