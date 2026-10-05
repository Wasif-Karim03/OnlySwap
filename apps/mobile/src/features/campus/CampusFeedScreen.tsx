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
import { IconButton } from '@/components/IconButton';
import { NavBar } from '@/components/NavBar';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { getEnv } from '@/lib/env';
import { fill } from '@/lib/format';
import { campus as copy, feed as feedCopy, saved as savedCopy } from '@/strings';
import { feedColumn } from '@/theme/layout';

import type { FeedCursor } from '../feed/logic';
import { answerWanted, getDraftStore, type DraftState } from '../sell/draft';
import { campusApi, campusKeys, type CampusApi } from './api';
import { CampusCard } from './CampusCards';
import { DiscoverSegment } from './DiscoverSegment';
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

type Deps = {
  api?: CampusApi;
  store?: StoreApi<DraftState>;
  mediaBase?: () => string;
  now?: () => Date;
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
      <NavBar
        variant="large"
        title={feedCopy.title}
        trailing={
          <View style={styles.row}>
            <IconButton
              icon="bookmark"
              accessibilityLabel={savedCopy.open}
              onPress={() => router.push('/saved')}
            />
            <IconButton
              icon="search"
              accessibilityLabel={feedCopy.search}
              onPress={() => router.push('/search')}
            />
          </View>
        }
      />
      <DiscoverSegment value="campus" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        accessibilityLabel={copy.filtersLabel}
        testID="campus-filters"
      >
        {CAMPUS_FILTERS.map((f) => (
          <Chip key={f} label={copy.filters[f]} selected={kind === f} onPress={() => setKind(f)} />
        ))}
      </ScrollView>
    </>
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
    const t = now;
    body = (
      <FlashList
        data={items}
        keyExtractor={(i) => i.id}
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
              <View style={styles.flex}>
                <Button
                  label={copy.postFood}
                  variant="secondary"
                  size="M"
                  onPress={postFood}
                  testID="campus-post-food"
                />
              </View>
              <View style={styles.flex}>
                <Button
                  label={copy.askFor}
                  variant="secondary"
                  size="M"
                  onPress={askFor}
                  testID="campus-ask"
                />
              </View>
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
        renderItem={({ item }) => (
          <CampusCard
            item={item}
            now={t}
            mediaBase={base}
            onOpen={() => open(item)}
            onAnswer={() => answer(item)}
            testID={`campus-item-${item.id}`}
          />
        )}
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

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  row: { flexDirection: 'row', gap: theme.space.sm },
  flex: { flex: 1 },
  pad: { padding: theme.space.screen },
  chips: {
    flexDirection: 'row',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.screen,
    paddingBottom: theme.space.md,
  },
  list: { paddingHorizontal: theme.space.screen, paddingBottom: theme.space['2xl'] },
  listHeader: { gap: theme.space.md, paddingBottom: theme.space.md },
  panel: {
    gap: theme.space.sm,
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.bg2,
  },
  gap: { height: theme.space.md },
  more: { paddingVertical: theme.space.lg, alignItems: 'center' },
}));
