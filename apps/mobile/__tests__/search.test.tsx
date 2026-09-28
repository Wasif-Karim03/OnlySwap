import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { useToastStore } from '../src/components/Toast';
import type { FeedItem } from '../src/features/feed/logic';
import type { SearchApi } from '../src/features/search/api';
import {
  activeCount,
  addRecent,
  cleanFilters,
  decodeFilters,
  dollarsToCents,
  encodeFilters,
  nextOffset,
  parseRecent,
  RECENT_MAX,
} from '../src/features/search/logic';
import { ResultsScreen } from '../src/features/search/ResultsScreen';
import { SearchScreen, SUGGEST_DEBOUNCE_MS } from '../src/features/search/SearchScreen';
import { search } from '../src/strings/en';

describe('search logic', () => {
  it('cleans filters: drops empties, orders, swaps min and max', () => {
    expect(
      cleanFilters({ category_ids: [], conditions: [], free_only: false, sort: 'relevance' }),
    ).toEqual({});
    expect(cleanFilters({ min_cents: 5000, max_cents: 1000, category_ids: [3, 1] })).toEqual({
      min_cents: 1000,
      max_cents: 5000,
      category_ids: [1, 3],
    });
    expect(cleanFilters({ conditions: ['fair', 'new'] }).conditions).toEqual(['new', 'fair']);
  });

  it('counts active filters without sort', () => {
    expect(activeCount({ sort: 'new' })).toBe(0);
    expect(
      activeCount({ min_cents: 100, max_cents: 200, free_only: true, hide_swiped: true }),
    ).toBe(3);
  });

  it('round-trips filters through the route and ignores junk', () => {
    const f = { category_ids: [1], max_cents: 4000, sort: 'price_asc' as const };
    expect(decodeFilters(encodeFilters(f))).toEqual(f);
    expect(encodeFilters({})).toBe('');
    expect(decodeFilters('{"sort":"random","colour":"red","free_only":true}')).toEqual({
      free_only: true,
    });
    expect(decodeFilters('not json')).toEqual({});
  });

  it('parses dollars', () => {
    expect(dollarsToCents('12')).toBe(1200);
    expect(dollarsToCents('$12.50')).toBe(1250);
    expect(dollarsToCents('')).toBeUndefined();
    expect(dollarsToCents('0')).toBeUndefined();
  });

  it('keeps 8 recent searches, newest first, no repeats', () => {
    let r: string[] = [];
    for (let i = 0; i < 10; i++) r = addRecent(r, `q${i}`);
    expect(r).toHaveLength(RECENT_MAX);
    expect(r[0]).toBe('q9');
    expect(addRecent(r, 'Q5')[0]).toBe('Q5');
    expect(addRecent(r, 'Q5').filter((x) => x.toLowerCase() === 'q5')).toHaveLength(1);
    expect(parseRecent([1, 'a', null])).toEqual(['a']);
  });

  it('pages by offset', () => {
    expect(nextOffset(20, 0)).toBe(20);
    expect(nextOffset(5, 20)).toBeNull();
  });
});

function fakeApi(over: Partial<SearchApi> = {}): SearchApi {
  return {
    search: jest.fn(async () => []),
    suggest: jest.fn(async () => []),
    saveSearch: jest.fn(async () => ({
      id: 's1',
      query: 'lamp',
      filters: {},
      alerts: true,
      last_seen_at: '',
      created_at: '',
    })),
    listSaved: jest.fn(async () => []),
    updateSaved: jest.fn(async () => ({}) as never),
    deleteSaved: jest.fn(async () => {}),
    newCounts: jest.fn(async () => []),
    ...over,
  };
}

const listing = (n: number): FeedItem =>
  ({
    id: `id-${n}`,
    kind: 'sale',
    status: 'active',
    title: `Lamp ${n}`,
    price_cents: 1200,
    photos: [{ path: 'p', thumb_path: 't', blurhash: null, width: 1, height: 1 }],
  }) as unknown as FeedItem;

function Stub({ id }: { id: string }) {
  return <Text testID={id}>{id}</Text>;
}

function render(routes: Record<string, () => ReactNode>, initialUrl: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderRouter(
    {
      index: () => <Stub id="screen-index" />,
      'listing/[id]/index': () => <Stub id="screen-listing" />,
      ...routes,
    },
    { initialUrl, wrapper },
  );
}

describe('B06 Search', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows recent and popular, suggests while typing, and searches', async () => {
    let stored: unknown = ['desk'];
    const api = fakeApi({
      suggest: jest.fn(async (q: string) =>
        q
          ? [{ type: 'title' as const, label: 'Mini fridge', count: null }]
          : [{ type: 'trending' as const, label: 'bike', count: 3 }],
      ),
    });
    render(
      {
        search: () => (
          <SearchScreen
            api={api}
            recentStorage={{ get: () => stored, set: (v) => void (stored = v) }}
          />
        ),
        'search/results': () => <Stub id="screen-results" />,
      },
      '/search',
    );
    expect(await screen.findByTestId('search-recent')).toBeTruthy();
    expect(await screen.findByText('bike')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('search-input'), 'fri');
    await act(async () => jest.advanceTimersByTime(SUGGEST_DEBOUNCE_MS));
    expect(await screen.findByText('Mini fridge')).toBeTruthy();
    expect(api.suggest).toHaveBeenLastCalledWith('fri');
    fireEvent.press(screen.getByText('Mini fridge'));
    expect(await screen.findByTestId('screen-results')).toBeTruthy();
    expect(stored).toEqual(['Mini fridge', 'desk']);
  });
});

describe('B07 Results', () => {
  beforeEach(() => useToastStore.setState({ current: undefined }));

  it('shows a grid and saves the search', async () => {
    const api = fakeApi({ search: jest.fn(async () => [listing(1), listing(2)]) });
    render(
      {
        'search/results': () => (
          <ResultsScreen
            q="lamp"
            api={api}
            categories={async () => []}
            mediaBase={() => 'http://m'}
          />
        ),
      },
      '/search/results',
    );
    expect(await screen.findByTestId('result-id-1')).toBeTruthy();
    expect(api.search).toHaveBeenCalledWith('lamp', {}, 0);
    fireEvent.press(screen.getByTestId('results-save'));
    await waitFor(() => expect(api.saveSearch).toHaveBeenCalledWith('lamp', {}));
    expect(useToastStore.getState().current?.message).toBe(search.searchSaved);
    fireEvent.press(screen.getByTestId('result-id-2'));
    expect(await screen.findByTestId('screen-listing')).toBeTruthy();
  });

  it('no results offers to save and clear filters; filters round trip', async () => {
    const api = fakeApi();
    render(
      {
        'search/results': () => (
          <ResultsScreen
            q="unicorn"
            initialFilters={{ free_only: true }}
            savedId="s9"
            api={api}
            categories={async () => [{ id: 1, name: 'Dorm & furniture', parentId: null }]}
            mediaBase={() => 'http://m'}
          />
        ),
      },
      '/search/results',
    );
    expect(await screen.findByTestId('results-empty')).toBeTruthy();
    expect(api.updateSaved).toHaveBeenCalledWith('s9', { seen: true });
    fireEvent.press(screen.getByTestId('results-filters'));
    fireEvent.changeText(await screen.findByTestId('filter-max'), '40');
    fireEvent.press(screen.getByTestId('filters-apply'));
    await waitFor(() =>
      expect(api.search).toHaveBeenLastCalledWith(
        'unicorn',
        { free_only: true, max_cents: 4000 },
        0,
      ),
    );
    fireEvent.press(await screen.findByText(search.noResultsClear));
    await waitFor(() => expect(api.search).toHaveBeenLastCalledWith('unicorn', {}, 0));
  });
});
