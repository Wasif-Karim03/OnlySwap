import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { IconButton } from '@/components/IconButton';
import { ListingTile } from '@/components/ListingTile';
import { NavBar } from '@/components/NavBar';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SkeletonGrid, SkeletonList } from '@/components/Skeleton';
import { Tag } from '@/components/Tag';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { Toggle } from '@/components/Toggle';
import { getEnv } from '@/lib/env';
import { fill } from '@/lib/format';
import { feed as feedCopy, saved as copy } from '@/strings/en';

import { feedApi, type FeedApi } from '../feed/api';
import type { FeedItem } from '../feed/logic';
import { searchApi, type SearchApi } from '../search/api';
import { encodeFilters, type SavedSearch } from '../search/logic';
import { mediaUrl, priceLabel } from '../sell/logic';
import { getSaved } from './api';

export type SavedItem = FeedItem & { price_at_save: number | null; saved_at: string };

/** A lower price than when saved (the "Price dropped" tag, B18). */
export function priceDropped(
  i: Pick<SavedItem, 'price_at_save' | 'price_cents' | 'status'>,
): boolean {
  return i.status !== 'sold' && i.price_at_save != null && i.price_cents < i.price_at_save;
}

export function searchTitle(s: Pick<SavedSearch, 'query'>): string {
  return s.query ?? copy.filtersOnly;
}

type Tab = 'items' | 'searches';

/** B09 Saved (P6-SAVE-01): Items and Searches tabs, alerts toggles, empty states (X38). */
export function SavedScreen({
  items = getSaved,
  api = feedApi,
  searches = searchApi,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
}: {
  items?: () => Promise<SavedItem[]>;
  api?: Pick<FeedApi, 'unsave'>;
  searches?: SearchApi;
  mediaBase?: () => string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('items');
  const itemsQ = useQuery({ queryKey: ['saved', 'items'], queryFn: items });
  const searchesQ = useQuery({
    queryKey: ['saved', 'searches'],
    queryFn: () => searches.listSaved(),
  });
  const countsQ = useQuery({ queryKey: ['saved', 'counts'], queryFn: () => searches.newCounts() });
  const base = mediaBase();

  const unsave = async (id: string) => {
    qc.setQueryData<SavedItem[]>(['saved', 'items'], (old) => old?.filter((i) => i.id !== id));
    try {
      await api.unsave(id);
    } catch {
      void itemsQ.refetch();
    }
  };

  const setAlerts = async (s: SavedSearch, alerts: boolean) => {
    qc.setQueryData<SavedSearch[]>(['saved', 'searches'], (old) =>
      old?.map((x) => (x.id === s.id ? { ...x, alerts } : x)),
    );
    try {
      await searches.updateSaved(s.id, { alerts });
    } catch {
      void searchesQ.refetch();
    }
  };

  const remove = async (s: SavedSearch) => {
    qc.setQueryData<SavedSearch[]>(['saved', 'searches'], (old) =>
      old?.filter((x) => x.id !== s.id),
    );
    try {
      await searches.deleteSaved(s.id);
    } catch {
      void searchesQ.refetch();
    }
  };

  let body;
  if (tab === 'items') {
    if (itemsQ.isPending) body = <SkeletonGrid />;
    else if (itemsQ.isError)
      body = <ErrorState error={itemsQ.error} onRetry={() => itemsQ.refetch()} />;
    else if (itemsQ.data.length === 0)
      body = (
        <EmptyState
          icon="bookmark"
          title={copy.emptyItemsTitle}
          body={copy.emptyItemsBody}
          action={{ label: copy.goDiscover, onPress: () => router.replace('/discover') }}
          testID="saved-items-empty"
        />
      );
    else
      body = (
        <FlatList
          data={itemsQ.data}
          numColumns={2}
          keyExtractor={(i) => i.id}
          columnWrapperStyle={styles.columns}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <View style={styles.cell}>
              <ListingTile
                title={item.title}
                price={priceLabel(item.kind, item.price_cents, feedCopy.free)}
                photo={item.photos[0] ? mediaUrl(base, item.photos[0].thumb_path) : null}
                blurhash={item.photos[0]?.blurhash}
                state={
                  item.status === 'sold' ? 'sold' : item.status === 'hold' ? 'hold' : 'default'
                }
                note={priceDropped(item) ? copy.priceDropped : null}
                onPress={() => router.push({ pathname: '/listing/[id]', params: { id: item.id } })}
                testID={`saved-${item.id}`}
              />
              <View style={styles.unsave}>
                <IconButton
                  icon="x"
                  filled
                  accessibilityLabel={fill(copy.unsave, { title: item.title })}
                  onPress={() => void unsave(item.id)}
                  testID={`unsave-${item.id}`}
                />
              </View>
            </View>
          )}
        />
      );
  } else {
    const counts = new Map((countsQ.data ?? []).map((c) => [c.id, c.new_count]));
    if (searchesQ.isPending) body = <SkeletonList />;
    else if (searchesQ.isError)
      body = <ErrorState error={searchesQ.error} onRetry={() => searchesQ.refetch()} />;
    else if (searchesQ.data.length === 0)
      body = (
        <EmptyState
          icon="search"
          title={copy.emptySearchesTitle}
          body={copy.emptySearchesBody}
          action={{ label: copy.goSearch, onPress: () => router.push('/search') }}
          testID="saved-searches-empty"
        />
      );
    else
      body = (
        <FlatList
          data={searchesQ.data}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: s }) => {
            const n = counts.get(s.id) ?? 0;
            const q = searchTitle(s);
            return (
              <View style={styles.searchRow} testID={`search-row-${s.id}`}>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Tappable
                      accessibilityRole="button"
                      accessibilityLabel={n > 0 ? `${q}, ${fill(copy.newCount, { n })}` : q}
                      onPress={() =>
                        router.push({
                          pathname: '/search/results',
                          params: { q: s.query ?? '', f: encodeFilters(s.filters), saved: s.id },
                        })
                      }
                      testID={`open-search-${s.id}`}
                    >
                      <View style={styles.hit}>
                        <Text variant="bodyStrong">{q}</Text>
                      </View>
                    </Tappable>
                  </View>
                  {n > 0 ? <Tag label={fill(copy.newCount, { n })} tone="accent" /> : null}
                  <IconButton
                    icon="trash"
                    accessibilityLabel={fill(copy.deleteSearch, { q })}
                    onPress={() => void remove(s)}
                    testID={`delete-search-${s.id}`}
                  />
                </View>
                <Toggle
                  label={copy.alerts}
                  value={s.alerts}
                  onChange={(v) => void setAlerts(s, v)}
                />
              </View>
            );
          }}
        />
      );
  }

  return (
    <View style={styles.root} testID="screen-saved">
      <NavBar
        title={copy.title}
        onLeading={() => (router.canGoBack() ? router.back() : router.replace('/discover'))}
      />
      <View style={styles.tabs}>
        <SegmentedControl
          label={copy.title}
          segments={[
            { value: 'items', label: copy.items },
            { value: 'searches', label: copy.searches },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {body}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  tabs: { paddingHorizontal: theme.space.screen, paddingBottom: theme.space.md },
  grid: { padding: theme.space.screen, gap: theme.space.lg },
  columns: { gap: theme.space.md },
  cell: { flex: 1 },
  unsave: { position: 'absolute', top: 0, right: 0 },
  list: { padding: theme.space.screen, gap: theme.space.md },
  searchRow: {
    padding: theme.space.lg,
    gap: theme.space.sm,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  flex: { flex: 1 },
  hit: { minHeight: theme.size.hit, justifyContent: 'center' },
}));
