import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { StoreApi } from 'zustand';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Icon, type IconName } from '@/components/icons/Icon';
import { SkeletonList } from '@/components/Skeleton';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { getEnv } from '@/lib/env';
import { fill } from '@/lib/format';
import { campus as copy } from '@/strings';
import { feedColumn } from '@/theme/layout';

import type { FeedCursor } from '../feed/logic';
import { answerWanted, getDraftStore, type DraftState } from '../sell/draft';
import { campusApi, campusKeys, type CampusApi } from './api';
import type { Me } from '../me/api';
import { CampusCard } from './CampusCards';
import { DiscoverHeader } from './DiscoverHeader';
import {
  CAMPUS_FILTERS,
  campusRows,
  dayOneBody,
  foundingState,
  isCampusFilter,
  mergeCampusPages,
  type CampusFilter,
  type CampusItem,
  type CampusPage,
  type CampusRow,
} from './logic';

const FILTER_ICON: Partial<Record<CampusFilter, IconName>> = { food: 'food', free: 'gift' };

type Deps = {
  api?: CampusApi;
  store?: StoreApi<DraftState>;
  mediaBase?: () => string;
  now?: () => Date;
  /** The signed-in student, for the campus name in the header. */
  loadMe?: () => Promise<Me>;
};

/**
 * C01 Around campus (P6-CAMP-01; board C1, C3, C4, C6, C7): the second side
 * of Discover (D19). Free food with a live countdown, free stuff, Wanted
 * posts with "I have this" and the last week's listings, newest first, with
 * the Day one hero and the founding sellers card while the campus is new.
 */
export function CampusFeedScreen({
  api = campusApi,
  store = getDraftStore(),
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  now = () => new Date(),
  loadMe,
}: Deps) {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  const [kind, setKind] = useState<CampusFilter>(isCampusFilter(params.kind) ? params.kind : 'all');

  const q = useInfiniteQuery({
    queryKey: campusKeys.feed(kind),
    queryFn: ({ pageParam }) => api.feed(kind, pageParam),
    initialPageParam: null as FeedCursor | null,
    getNextPageParam: (last: CampusPage) => last.next_cursor ?? undefined,
  });

  const base = mediaBase();
  const open = (item: CampusItem) =>
    router.push({ pathname: '/listing/[id]', params: { id: item.id } });
  const answer = (item: CampusItem) => {
    answerWanted(store, item);
    router.push('/sell');
  };
  const postFood = () => router.push('/sell/food');
  const askFor = () => router.push('/sell/wanted');
  const sell = () => router.push('/sell');

  const header = (
    <>
      <DiscoverHeader value="campus" surface="card" loadMe={loadMe} />
      {/*
        A horizontal ScrollView grows to fill a column by default; flexGrow 0
        keeps the chip row to its own height (DEC 90 fix: it left a ~300 pt
        gap above the feed).
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

  const renderRow = (row: CampusRow) =>
    row.kind === 'wide' ? (
      <CampusCard
        item={row.item}
        now={now}
        mediaBase={base}
        onOpen={() => open(row.item)}
        onAnswer={() => answer(row.item)}
        testID={`campus-item-${row.item.id}`}
      />
    ) : (
      <View style={styles.pair}>
        {row.items.map((item) => (
          <View key={item.id} style={styles.flex}>
            <CampusCard
              item={item}
              now={now}
              mediaBase={base}
              onOpen={() => open(item)}
              onAnswer={() => answer(item)}
              testID={`campus-item-${item.id}`}
            />
          </View>
        ))}
        {row.items.length === 1 ? <View style={styles.flex} /> : null}
      </View>
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
    const rows = campusRows(mergeCampusPages(pages));
    const founding = foundingState(first?.founding);
    body = (
      <FlashList
        data={rows}
        keyExtractor={(r) => r.key}
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
            {first?.day_one && kind === 'all' ? (
              <View style={styles.panel} testID="campus-day-one">
                <Text variant="heading" accessibilityRole="header">
                  {copy.dayOneTitle}
                </Text>
                <Text variant="body" tone="ink2">
                  {dayOneBody(first.active_listings)}
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
                        left: first?.founding.left ?? 0,
                        limit: first?.founding.limit ?? 0,
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
            <View style={styles.row}>
              <PostPill
                icon="food"
                label={copy.postFood}
                onPress={postFood}
                testID="campus-post-food"
              />
              <PostPill icon="plus" label={copy.askFor} onPress={askFor} testID="campus-ask" />
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={kind === 'food' ? 'food' : kind === 'wanted' ? 'search' : 'gift'}
            title={copy.empty[kind].title}
            body={copy.empty[kind].body}
            action={
              kind === 'food'
                ? { label: copy.postFood, onPress: postFood }
                : kind === 'wanted'
                  ? { label: copy.askFor, onPress: askFor }
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
        renderItem={({ item }) => renderRow(item)}
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

const styles = StyleSheet.create((theme) => ({
  // Grey page, white cards (DEC 90 mock screen 5).
  root: { flex: 1, backgroundColor: theme.colors.bg2 },
  row: { flexDirection: 'row', gap: theme.space.sm },
  flex: { flex: 1 },
  pad: { padding: theme.space.screen },
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
  panel: {
    gap: theme.space.sm,
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.card,
  },
  pair: { flexDirection: 'row', gap: theme.space.md },
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
