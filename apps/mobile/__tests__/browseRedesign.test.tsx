import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';

import { Avatar } from '../src/components/Avatar';
import { imageStyles, Photo } from '../src/components/Photo';
import type { CampusApi } from '../src/features/campus/api';
import { CampusFeedScreen } from '../src/features/campus/CampusFeedScreen';
import { DiscoverHeader } from '../src/features/campus/DiscoverHeader';
import { campusRows, type CampusItem, type CampusPage } from '../src/features/campus/logic';
import { yearLabel } from '../src/features/feed/logic';
import { SwipeDeck } from '../src/features/feed/SwipeDeck';
import type { DeckCard } from '../src/features/feed/SwipeCard';
import type { Me } from '../src/features/me/api';
import { SavedScreen, type SavedItem } from '../src/features/saved/SavedScreen';
import type { SearchApi } from '../src/features/search/api';
import { SearchScreen } from '../src/features/search/SearchScreen';
import { campus, feed, saved, search } from '../src/strings/en';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const NOW = new Date('2027-03-10T12:00:00Z');

function Stub({ id }: { id: string }) {
  return <Text testID={id}>{id}</Text>;
}

function renderAt(routes: Record<string, () => ReactNode>, initialUrl: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderRouter(
    { index: () => <Stub id="screen-index" />, ...routes },
    { initialUrl, wrapper },
  );
}

const me = (shortName: string | null) => async () =>
  ({
    campus: shortName ? { id: 'c', name: shortName, short_name: shortName, timezone: 'UTC' } : null,
  }) as unknown as Me;

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => jest.restoreAllMocks());

describe('DEC 90 photos render on web (expo-image size fix)', () => {
  it('gives expo-image plain React Native styles, not Unistyles ones', () => {
    render(<Photo source="https://media.test/a.webp" testID="p" />);
    const style = StyleSheet.flatten(
      screen.getByTestId('p-image', { includeHiddenElements: true }).props.style,
    );
    expect(style).toMatchObject({ width: '100%', height: '100%' });
    expect(imageStyles.image).toEqual({ width: '100%', height: '100%' });
  });

  it('fill mode drops the aspect ratio and fills the parent', () => {
    render(<Photo source="https://media.test/a.webp" fill testID="p" />);
    const frame = StyleSheet.flatten(
      screen.getByTestId('p', { includeHiddenElements: true }).props.style,
    );
    expect(frame).toMatchObject({ position: 'absolute', top: 0, bottom: 0 });
    expect(frame.aspectRatio).toBeUndefined();
  });

  it('avatar photos use the same plain style', () => {
    const r = render(<Avatar name="Maya R." uri="https://media.test/m.webp" />);
    const image = r.UNSAFE_root.findAll(
      (n) =>
        typeof n.props.source === 'object' && n.props.source?.uri === 'https://media.test/m.webp',
    )[0];
    expect(StyleSheet.flatten(image!.props.style)).toMatchObject({ width: '100%', height: '100%' });
  });
});

describe('DEC 90 Discover deck card and buttons', () => {
  const card: DeckCard = {
    id: 'a',
    title: 'Studio headphones',
    price: '$45',
    meta: 'Like new · 12 minutes ago',
    sellerName: 'Maya R.',
    sellerAvatar: null,
    sellerYear: 'Junior',
    photos: [{ uri: 'https://media.test/a.webp', blurhash: null }],
    saveCount: 0,
  };

  it('shows title, price, meta and the seller on the card, and the three buttons', async () => {
    render(<SwipeDeck cards={[card]} onSwipe={jest.fn()} onOpen={jest.fn()} listMode={false} />);
    expect(await screen.findByTestId('deck-card-a')).toBeTruthy();
    expect(screen.getByText('Studio headphones')).toBeTruthy();
    expect(screen.getByText('$45')).toBeTruthy();
    expect(screen.getByText('Like new · 12 minutes ago')).toBeTruthy();
    expect(screen.getByText('Maya R.')).toBeTruthy();
    expect(screen.getByText('Junior')).toBeTruthy();
    expect(screen.getByTestId('deck-skip').props.accessibilityLabel).toBe(feed.skip);
    expect(screen.getByTestId('deck-save').props.accessibilityLabel).toBe(feed.save);
    // The offer pill says it in words now ("$" before DEC 90).
    expect(screen.getByTestId('deck-offer').props.accessibilityLabel).toBe(feed.offer);
    expect(screen.getByText(feed.offer)).toBeTruthy();
  });

  it('grid tiles keep Skip, Save and a short Offer', () => {
    const onSwipe = jest.fn();
    render(<SwipeDeck cards={[card]} onSwipe={onSwipe} onOpen={jest.fn()} gridWidth={393} />);
    expect(screen.getByText(feed.offerShort, { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(screen.getByTestId('deck-item-a-save', { includeHiddenElements: true }));
    expect(onSwipe).toHaveBeenCalledWith(card, 'save');
  });

  it('class year labels come from the profile copy', () => {
    expect(yearLabel('junior')).toBe('Junior');
    expect(yearLabel('nope')).toBeNull();
    expect(yearLabel(null)).toBeNull();
  });
});

describe('DEC 90 Discover header', () => {
  it('shows the campus name, and the bell opens notifications', async () => {
    renderAt(
      {
        discover: () => <DiscoverHeader value="swipe" loadMe={me('Demo University')} />,
        notifications: () => <Stub id="screen-notifications" />,
      },
      '/discover',
    );
    expect(await screen.findByText('Demo University')).toBeTruthy();
    expect(screen.getByRole('header', { name: feed.title })).toBeTruthy();
    expect(screen.getByRole('tab', { name: campus.segmentSwipe, selected: true })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: feed.notifications }));
    expect(await screen.findByTestId('screen-notifications')).toBeTruthy();
  });

  it('leaves the campus line out until it is known', async () => {
    renderAt({ discover: () => <DiscoverHeader value="swipe" loadMe={me(null)} /> }, '/discover');
    expect(await screen.findByTestId('discover-header')).toBeTruthy();
    expect(screen.queryByTestId('discover-campus')).toBeNull();
  });
});

function campusItem(id: string, over: Partial<CampusItem> = {}): CampusItem {
  return {
    id,
    kind: 'sale',
    status: 'active',
    title: `Item ${id}`,
    description: null,
    price_cents: 2500,
    condition: 'good',
    category_id: 3,
    open_to_offers: true,
    meet_spot_ids: [],
    meet_note: null,
    availability: [],
    save_count: 0,
    view_count: 0,
    offer_count: 0,
    bumped_at: NOW.toISOString(),
    created_at: NOW.toISOString(),
    expires_at: null,
    is_own: false,
    saved: false,
    watching: false,
    seller: { id: 's1', display_name: 'Sam T.', avatar_path: null, year: null, created_at: null },
    photos: [],
    wanted_max_cents: null,
    wanted_ref: null,
    place: null,
    ...over,
  };
}

describe('DEC 90 Around campus', () => {
  it('pairs listings into grid rows; food and Wanted span the width', () => {
    const rows = campusRows([
      campusItem('f', { kind: 'food' }),
      campusItem('a'),
      campusItem('b', { kind: 'free' }),
      campusItem('c'),
      campusItem('w', { kind: 'wanted' }),
      campusItem('d'),
    ]);
    expect(rows.map((r) => (r.kind === 'wide' ? r.item.id : r.items.map((i) => i.id)))).toEqual([
      'f',
      ['a', 'b'],
      ['c'],
      'w',
      ['d'],
    ]);
  });

  it('the chip row keeps its own height (no gap above the feed) and Wanted reads like a person', async () => {
    const page: CampusPage = {
      items: [
        campusItem('w1', { kind: 'wanted', title: 'Graphing calculator', wanted_max_cents: 6000 }),
        campusItem('l1', { title: 'City bike', place: 'North dorms' }),
      ],
      next_cursor: null,
      day_one: false,
      active_listings: 40,
      founding: { limit: 0, left: 0, mine: false },
    };
    const api: CampusApi = { feed: jest.fn(async () => page) } as unknown as CampusApi;
    renderAt(
      {
        'discover/campus': () => (
          <CampusFeedScreen
            api={api}
            now={() => NOW}
            mediaBase={() => 'http://m'}
            loadMe={me('Demo University')}
          />
        ),
      },
      '/discover/campus',
    );
    expect(await screen.findByTestId('campus-item-w1')).toBeTruthy();
    const chips = StyleSheet.flatten(screen.getByTestId('campus-filters').props.style);
    expect(chips).toMatchObject({ flexGrow: 0 });
    expect(screen.getByText('Sam T. is looking for')).toBeTruthy();
    expect(screen.getByText('Up to $60')).toBeTruthy();
    expect(screen.getByText('North dorms')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: campus.filters.food })).toBeTruthy();
  });
});

function searchApi(over: Partial<SearchApi> = {}): SearchApi {
  return {
    search: jest.fn(async () => []),
    suggest: jest.fn(async () => [
      { type: 'category' as const, label: 'Bikes and transport', count: 9 },
    ]),
    saveSearch: jest.fn(),
    listSaved: jest.fn(async () => []),
    updateSaved: jest.fn(async () => ({}) as never),
    deleteSaved: jest.fn(async () => {}),
    newCounts: jest.fn(async () => []),
    ...over,
  };
}

describe('DEC 90 Search', () => {
  it('removes one recent search, and lists popular terms as rows with counts', async () => {
    let stored: unknown = ['desk lamp', 'bike'];
    renderAt(
      {
        search: () => (
          <SearchScreen
            api={searchApi()}
            recentStorage={{ get: () => stored, set: (v) => void (stored = v) }}
          />
        ),
      },
      '/search',
    );
    expect(await screen.findByText('Bikes and transport')).toBeTruthy();
    expect(screen.getByText('9 listed')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Remove desk lamp' }));
    await waitFor(() => expect(screen.queryByText('desk lamp')).toBeNull());
    expect(stored).toEqual(['bike']);
    expect(screen.getByText(search.recent)).toBeTruthy();
  });
});

describe('DEC 90 Saved', () => {
  it('shows price drop in words and on hold and sold as plain words', async () => {
    const items = [
      { id: 'i1', status: 'active', price_at_save: 2000, price_cents: 1500, title: 'Bike' },
      { id: 'i2', status: 'hold', price_at_save: 2000, price_cents: 2000, title: 'Shoes' },
      { id: 'i3', status: 'sold', price_at_save: 2000, price_cents: 2000, title: 'Camera' },
    ].map(
      (p) =>
        ({
          kind: 'sale',
          condition: 'good',
          bumped_at: NOW.toISOString(),
          saved_at: '',
          photos: [],
          ...p,
        }) as unknown as SavedItem,
    );
    renderAt(
      {
        saved: () => (
          <SavedScreen
            items={async () => items}
            api={{ unsave: jest.fn() }}
            searches={searchApi()}
            now={() => NOW}
          />
        ),
      },
      '/saved',
    );
    expect(await screen.findByText(saved.priceDropped)).toBeTruthy();
    expect(screen.getByText(search.tileHold)).toBeTruthy();
    expect(screen.getByText(search.tileSold)).toBeTruthy();
    expect(screen.getByRole('header', { name: saved.title })).toBeTruthy();
    await act(async () => {});
  });
});
