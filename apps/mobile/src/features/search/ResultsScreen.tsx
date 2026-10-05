import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { countBucket, track } from '@/lib/analytics';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { IconButton } from '@/components/IconButton';
import { ListingTile } from '@/components/ListingTile';
import { NavBar } from '@/components/NavBar';
import { SkeletonGrid } from '@/components/Skeleton';
import { useToastStore } from '@/components/Toast';
import { getEnv } from '@/lib/env';
import { fill } from '@/lib/format';
import { feed as feedCopy, search as copy } from '@/strings';
import { gridCellWidth, gridColumns, useLayout } from '@/theme/layout';

import { sellApi } from '../sell/api';
import { mediaUrl, priceLabel, type Category } from '../sell/logic';
import { searchApi, type SearchApi } from './api';
import { FiltersSheet } from './FiltersSheet';
import { activeCount, nextOffset, type SearchFilters } from './logic';

/** B07 Results (P6-SRCH-03): grid, filters, save search, no results (X5). */
export function ResultsScreen({
  q,
  initialFilters = {},
  savedId,
  api = searchApi,
  categories = () => sellApi.categories(),
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
}: {
  q: string;
  initialFilters?: SearchFilters;
  savedId?: string;
  api?: SearchApi;
  categories?: () => Promise<Category[]>;
  mediaBase?: () => string;
}) {
  const router = useRouter();
  // More columns on iPad; every cell the same width, even in a short last row.
  const { width } = useLayout();
  const columns = gridColumns(width);
  const cell = { width: gridCellWidth(width, columns) };
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [sheet, setSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const cats = useQuery({ queryKey: ['categories'], queryFn: categories, staleTime: 3600_000 });

  const results = useInfiniteQuery({
    queryKey: ['search', q, filters],
    queryFn: ({ pageParam }) => api.search(q, filters, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      nextOffset(
        last.length,
        pages.slice(0, -1).reduce((n, p) => n + p.length, 0),
      ) ?? undefined,
  });

  // search_performed once per query, with a bucketed result count (no query text).
  const firstCount = results.data?.pages[0]?.length;
  const searchKey = JSON.stringify([q, filters]);
  const tracked = useRef<string | null>(null);
  useEffect(() => {
    if (firstCount === undefined || tracked.current === searchKey) return;
    tracked.current = searchKey;
    track('search_performed', { results_bucket: countBucket(firstCount) });
  }, [searchKey, firstCount]);

  // Opening a saved search resets its "new" count.
  useEffect(() => {
    if (savedId) api.updateSaved(savedId, { seen: true }).catch(() => {});
  }, [savedId, api]);

  const save = async () => {
    setSaving(true);
    try {
      await api.saveSearch(q, filters);
      track('search_saved');
      useToastStore.getState().show('success', copy.searchSaved);
    } catch {
      useToastStore.getState().show('error', copy.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const items = results.data?.pages.flat() ?? [];
  const n = activeCount(filters);
  const base = mediaBase();

  let body;
  if (results.isPending) {
    body = <SkeletonGrid testID="results-loading" />;
  } else if (results.isError) {
    body = <ErrorState error={results.error} onRetry={() => results.refetch()} />;
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon="search"
        title={copy.noResultsTitle}
        body={copy.noResultsBody}
        action={{ label: copy.saveSearch, onPress: () => void save() }}
        secondaryAction={
          n ? { label: copy.noResultsClear, onPress: () => setFilters({}) } : undefined
        }
        testID="results-empty"
      />
    );
  } else {
    body = (
      <FlatList
        key={`cols-${columns}`}
        data={items}
        numColumns={columns}
        keyExtractor={(i) => i.id}
        columnWrapperStyle={styles.columns}
        contentContainerStyle={styles.grid}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (results.hasNextPage && !results.isFetchingNextPage) void results.fetchNextPage();
        }}
        renderItem={({ item }) => (
          <View style={cell}>
            <ListingTile
              title={item.title}
              price={priceLabel(item.kind, item.price_cents, feedCopy.free)}
              photo={item.photos[0] ? mediaUrl(base, item.photos[0].thumb_path) : null}
              blurhash={item.photos[0]?.blurhash}
              state={item.status === 'hold' ? 'hold' : 'default'}
              onPress={() => router.push({ pathname: '/listing/[id]', params: { id: item.id } })}
              testID={`result-${item.id}`}
            />
          </View>
        )}
        testID="results-grid"
      />
    );
  }

  return (
    <View style={styles.root} testID="screen-results">
      <NavBar
        title={q ? fill(copy.resultsTitle, { q }) : copy.allTitle}
        onLeading={() => router.back()}
        trailing={
          <IconButton
            icon="bookmark"
            accessibilityLabel={copy.saveSearch}
            disabled={saving}
            onPress={save}
            testID="results-save"
          />
        }
      />
      <View style={styles.tools}>
        <Button
          label={n ? fill(copy.filtersActive, { n }) : copy.filters}
          variant="secondary"
          size="S"
          onPress={() => setSheet(true)}
          testID="results-filters"
        />
      </View>
      {body}
      <FiltersSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        value={filters}
        onApply={(f) => {
          setFilters(f);
          setSheet(false);
        }}
        categories={cats.data ?? []}
        hasQuery={!!q}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  tools: {
    flexDirection: 'row',
    paddingHorizontal: theme.space.screen,
    paddingBottom: theme.space.sm,
  },
  grid: { padding: theme.space.screen, gap: theme.space.lg },
  columns: { gap: theme.space.md },
}));
