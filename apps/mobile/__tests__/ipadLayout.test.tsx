import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render as rtlRender,
  renderHook,
  screen,
} from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import * as RN from 'react-native';
import { StyleSheet, Text } from 'react-native';

import { Sheet } from '../src/components/Sheet';
import { TabBar } from '../src/components/TabBar';
import { SwipeDeck } from '../src/features/feed/SwipeDeck';
import type { DeckCard } from '../src/features/feed/SwipeCard';
import type { FeedItem } from '../src/features/feed/logic';
import type { OffersApi } from '../src/features/offers/api';
import { InboxScreen } from '../src/features/offers/InboxScreen';
import type { ChatSummary } from '../src/features/offers/logic';
import type { SearchApi } from '../src/features/search/api';
import { ResultsScreen } from '../src/features/search/ResultsScreen';
import { offers } from '../src/strings/en';
import {
  LAYOUT,
  gridCellWidth,
  gridColumns,
  layoutFor,
  sizeClass,
  useLayout,
} from '../src/theme/layout';

// Window sizes in points: iPhone 17 Pro Max, iPad 11" portrait, iPad 13" landscape.
const PHONE = { width: 440, height: 956 };
const IPAD_PORTRAIT = { width: 820, height: 1180 };
const IPAD_LANDSCAPE = { width: 1376, height: 1032 };

function setWindow(size: { width: number; height: number }) {
  const d = { ...size, scale: 2, fontScale: 1 };
  act(() => RN.Dimensions.set({ window: d, screen: d }));
}

afterEach(() => setWindow(PHONE));

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
      'chat/[id]': () => <Stub id="screen-chat" />,
      'listing/[id]/index': () => <Stub id="screen-listing" />,
      ...routes,
    },
    { initialUrl, wrapper },
  );
}

describe('T-UNIT-IPAD-01 useLayout size classes (P17-FEAT-02)', () => {
  it('compact below 600, regular to 1023, wide from 1024', () => {
    expect(sizeClass(0)).toBe('compact');
    expect(sizeClass(440)).toBe('compact');
    expect(sizeClass(599)).toBe('compact');
    expect(sizeClass(600)).toBe('regular');
    expect(sizeClass(1023)).toBe('regular');
    expect(sizeClass(1024)).toBe('wide');
    expect(sizeClass(1376)).toBe('wide');
    expect(layoutFor(820, 1180)).toEqual({
      width: 820,
      height: 1180,
      size: 'regular',
      tablet: true,
      wide: false,
    });
    expect(layoutFor(1032).wide).toBe(true);
    expect(layoutFor(390).tablet).toBe(false);
  });

  it('follows the window: rotation and Split View resizes update it', () => {
    setWindow(PHONE);
    const { result } = renderHook(() => useLayout());
    expect(result.current.size).toBe('compact');
    setWindow(IPAD_PORTRAIT);
    expect(result.current.size).toBe('regular');
    setWindow(IPAD_LANDSCAPE);
    expect(result.current).toMatchObject({ size: 'wide', wide: true, width: 1376 });
    // Slide Over / one-third split: back to the phone layout.
    setWindow({ width: 375, height: 1032 });
    expect(result.current.size).toBe('compact');
  });

  it('every phone width fits inside the max widths, so phones are unchanged', () => {
    for (const max of [LAYOUT.readableMax, LAYOUT.feedMax, LAYOUT.deckMax, LAYOUT.sheetMax]) {
      expect(max).toBeGreaterThan(PHONE.width);
    }
  });
});

describe('T-UNIT-IPAD-02 listing grid columns by width', () => {
  it('2 on phones, more on iPad, clamped to 5', () => {
    expect(gridColumns(375)).toBe(2);
    expect(gridColumns(440)).toBe(2);
    expect(gridColumns(600)).toBe(2);
    expect(gridColumns(820)).toBe(3);
    expect(gridColumns(950)).toBe(3);
    expect(gridColumns(1180)).toBe(4);
    expect(gridColumns(1376)).toBe(5);
    expect(gridColumns(3000)).toBe(LAYOUT.maxColumns);
  });

  it('cells fill the row with the gaps and padding taken out', () => {
    const w = 820;
    const cols = gridColumns(w);
    const cell = gridCellWidth(w, cols);
    expect(cell * cols + 12 * (cols - 1) + 20 * 2).toBeLessThanOrEqual(w);
    expect(cell).toBeGreaterThanOrEqual(LAYOUT.tileMin);
    expect(gridCellWidth(0, 2)).toBe(0);
  });
});

const chat = (id: string, name: string): ChatSummary =>
  ({
    id,
    listing_id: 'l1',
    offer_id: 'o1',
    status: 'open',
    listing_title: 'Dell monitor',
    listing_price_cents: 6000,
    listing_thumb_path: null,
    agreed_cents: 6000,
    role: 'buyer',
    last_message_at: '',
    muted: false,
    unread: false,
    last_message: { kind: 'text', body: 'See you at 4:30', mine: false, created_at: '' },
    other: { id: `u-${id}`, display_name: name, avatar_path: null },
  }) as ChatSummary;

function inboxApi(): OffersApi {
  return {
    make: jest.fn(),
    accept: jest.fn(),
    counter: jest.fn(),
    decline: jest.fn(),
    withdraw: jest.fn(),
    get: jest.fn(),
    inbox: jest.fn(async () => ({
      incoming: [],
      outgoing: [],
      chats: [chat('c1', 'Aisha K.'), chat('c2', 'Leo M.')],
    })),
    listingOffers: jest.fn(async () => []),
  } as unknown as OffersApi;
}

const quiet = { userId: async () => null, subscribe: () => () => {} };

describe('T-UNIT-IPAD-03 Inbox two panes on wide iPad (board N6)', () => {
  const inbox = () => (
    <InboxScreen
      api={inboxApi()}
      realtime={quiet}
      chatPane={(id) => <Stub id={`pane-chat-${id}`} />}
    />
  );

  it('wide: list and chat side by side; tapping a chat opens it in the right pane', async () => {
    setWindow(IPAD_LANDSCAPE);
    render({ inbox }, '/inbox');
    expect(await screen.findByTestId('inbox-list-pane')).toBeTruthy();
    expect(screen.getByTestId('inbox-chat-pane')).toBeTruthy();
    expect(screen.getByTestId('inbox-pane-empty')).toBeTruthy();
    expect(screen.getByText(offers.paneEmptyTitle)).toBeTruthy();
    fireEvent.press(screen.getByText(offers.tabChats));
    fireEvent.press(await screen.findByTestId('inbox-chat-c1'));
    expect(await screen.findByTestId('pane-chat-c1')).toBeTruthy();
    expect(screen.getByTestId('inbox-chat-c1').props.accessibilityState).toMatchObject({
      selected: true,
    });
    // Still on the Inbox: no navigation to the full-screen chat.
    expect(screen.queryByTestId('screen-chat')).toBeNull();
    fireEvent.press(screen.getByTestId('inbox-chat-c2'));
    expect(await screen.findByTestId('pane-chat-c2')).toBeTruthy();
    expect(screen.queryByTestId('pane-chat-c1')).toBeNull();
  });

  it('compact and regular: one pane, a chat opens full screen', async () => {
    for (const size of [PHONE, IPAD_PORTRAIT]) {
      setWindow(size);
      const view = render({ inbox }, '/inbox');
      fireEvent.press(await screen.findByText(offers.tabChats));
      expect(screen.queryByTestId('inbox-list-pane')).toBeNull();
      expect(screen.queryByTestId('inbox-chat-pane')).toBeNull();
      fireEvent.press(await screen.findByTestId('inbox-chat-c1'));
      expect(await screen.findByTestId('screen-chat')).toBeTruthy();
      view.unmount();
    }
  });
});

function searchApi(items: FeedItem[]): SearchApi {
  return {
    search: jest.fn(async () => items),
    suggest: jest.fn(async () => []),
    saveSearch: jest.fn(),
    listSaved: jest.fn(async () => []),
    updateSaved: jest.fn(),
    deleteSaved: jest.fn(),
    newCounts: jest.fn(async () => []),
  } as unknown as SearchApi;
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

describe('T-UNIT-IPAD-04 search results grid takes more columns on iPad', () => {
  it.each([
    [PHONE, 2],
    [IPAD_PORTRAIT, 3],
    [IPAD_LANDSCAPE, 5],
  ])('window %o: %i columns', async (size, cols) => {
    setWindow(size);
    render(
      {
        'search/results': () => (
          <ResultsScreen
            q="lamp"
            api={searchApi([1, 2, 3, 4, 5, 6, 7].map(listing))}
            categories={async () => []}
            mediaBase={() => 'http://m'}
          />
        ),
      },
      '/search/results',
    );
    expect(await screen.findByTestId('result-id-1')).toBeTruthy();
    expect(screen.UNSAFE_getByType(RN.FlatList).props.numColumns).toBe(cols);
  });
});

describe('T-UNIT-IPAD-05 sheets float as a centered card on iPad', () => {
  const panelWidthCap = () => {
    const panel = screen.getByTestId('sheet');
    return StyleSheet.flatten(panel.props.style)?.maxWidth;
  };

  it('phone: full-width bottom sheet; iPad: capped at sheetMax', () => {
    setWindow(PHONE);
    const phone = rtlRender(
      <Sheet visible onClose={() => {}} title="Filters" testID="sheet">
        <Text>body</Text>
      </Sheet>,
    );
    expect(panelWidthCap()).toBeUndefined();
    phone.unmount();

    setWindow(IPAD_PORTRAIT);
    rtlRender(
      <Sheet visible onClose={() => {}} title="Filters" testID="sheet">
        <Text>body</Text>
      </Sheet>,
    );
    expect(panelWidthCap()).toBe(LAYOUT.sheetMax);
  });
});

describe('T-UNIT-IPAD-06 sidebar and grid Discover (board N5)', () => {
  const items = [
    { key: 'discover', label: 'Discover', icon: 'cards' as const },
    { key: 'inbox', label: 'Inbox', icon: 'chat' as const, badge: 3 },
  ];

  it('the rail keeps tab roles, selection and badges', () => {
    const onSelect = jest.fn();
    rtlRender(
      <TabBar layout="rail" items={items} activeKey="discover" onSelect={onSelect} testID="tabs" />,
    );
    expect(screen.UNSAFE_getByProps({ accessibilityRole: 'tablist' })).toBeTruthy();
    const inbox = screen.getByTestId('tabs-inbox');
    expect(inbox.props.accessibilityLabel).toBe('Inbox, 3 new');
    expect(screen.getByTestId('tabs-discover').props.accessibilityState).toEqual({
      selected: true,
    });
    fireEvent.press(inbox);
    expect(onSelect).toHaveBeenCalledWith('inbox');
  });

  const card = (n: number): DeckCard => ({
    id: `c${n}`,
    title: `Desk lamp ${n}`,
    price: '$12',
    meta: 'Good condition',
    sellerName: 'Aisha K.',
    sellerAvatar: null,
    photos: [],
    saveCount: 0,
  });

  it('gridWidth swaps the deck for equal tiles, each with Skip, Save and Offer', () => {
    const onSwipe = jest.fn();
    const cards = [1, 2, 3, 4].map(card);
    rtlRender(
      <SwipeDeck cards={cards} onSwipe={onSwipe} onOpen={jest.fn()} gridWidth={1376 - 230} />,
    );
    expect(screen.getByTestId('deck-list')).toBeTruthy();
    const cols = gridColumns(1376 - 230);
    const width = gridCellWidth(1376 - 230, cols);
    for (const c of cards) {
      expect(StyleSheet.flatten(screen.getByTestId(`deck-tile-${c.id}`).props.style).width).toBe(
        width,
      );
    }
    // The buttons repeat the tile's screen-reader actions, so they are hidden from it.
    const hidden = { includeHiddenElements: true };
    fireEvent.press(screen.getByTestId('deck-item-c2-offer', hidden));
    expect(onSwipe).toHaveBeenCalledWith(cards[1], 'right');
    fireEvent.press(screen.getByTestId('deck-item-c3-skip', hidden));
    expect(onSwipe).toHaveBeenCalledWith(cards[2], 'left');
  });
});
