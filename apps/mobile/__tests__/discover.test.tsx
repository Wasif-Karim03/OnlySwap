import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Text } from 'react-native';

import { useToastStore } from '../src/components/Toast';
import type { FeedApi } from '../src/features/feed/api';
import { DiscoverScreen } from '../src/features/feed/DiscoverScreen';
import { ListingScreen } from '../src/features/feed/ListingScreen';
import {
  enqueue,
  mergePage,
  nextCursor,
  parseQueue,
  QUEUE_CAP,
  toDeckCard,
  toServer,
  undoPlan,
  type FeedItem,
  type ListingResult,
  type QueuedSwipe,
} from '../src/features/feed/logic';
import { createSwipeStore } from '../src/features/feed/swipes';
import { feed } from '../src/strings/en';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const NOW = new Date('2027-03-10T12:00:00Z');

function item(n: number, patch: Partial<FeedItem> = {}): FeedItem {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    kind: 'sale',
    status: 'active',
    title: `Item ${n}`,
    description: 'Works great',
    price_cents: 1000 + n,
    condition: 'good',
    category_id: 1,
    open_to_offers: true,
    meet_spot_ids: [],
    meet_note: null,
    availability: [],
    save_count: 0,
    view_count: 0,
    offer_count: 0,
    bumped_at: new Date(NOW.getTime() - n * 60_000).toISOString(),
    created_at: NOW.toISOString(),
    expires_at: null,
    is_own: false,
    saved: false,
    watching: false,
    seller: {
      id: 'seller-1',
      display_name: 'Aisha A.',
      avatar_path: null,
      year: null,
      created_at: null,
    },
    photos: [
      {
        path: `c/x/l/${n}/a.webp`,
        thumb_path: `c/x/l/${n}/a_t.webp`,
        blurhash: null,
        width: 1,
        height: 1,
      },
    ],
    ...patch,
  };
}

function fakeApi(over: Partial<FeedApi> = {}): FeedApi {
  return {
    getFeed: jest.fn(async () => []),
    recordSwipes: jest.fn(async () => {}),
    undoSwipe: jest.fn(async () => {}),
    save: jest.fn(async () => 1),
    unsave: jest.fn(async () => 0),
    hide: jest.fn(async () => {}),
    watch: jest.fn(async () => {}),
    recordView: jest.fn(async () => {}),
    getListing: jest.fn(async () => ({ id: 'x', access: 'gone' }) as ListingResult),
    reportListing: jest.fn(async () => {}),
    ...over,
  };
}

function memory(initial: unknown = undefined) {
  let v = initial;
  return { get: () => v, set: (q: QueuedSwipe[]) => void (v = q) };
}

const swipe = (id: string, at: Date, dir: QueuedSwipe['dir'] = 'left'): QueuedSwipe => ({
  listing_id: id,
  dir,
  at: at.toISOString(),
});

describe('T-UNIT-FEED-01 useSwipe batching', () => {
  it('flushes at 10 swipes', async () => {
    const api = fakeApi();
    const store = createSwipeStore(memory(), api, () => NOW);
    for (let i = 0; i < 9; i++) store.getState().swipe(`id-${i}`, 'left');
    expect(api.recordSwipes).not.toHaveBeenCalled();
    store.getState().swipe('id-9', 'save');
    await waitFor(() => expect(api.recordSwipes).toHaveBeenCalledTimes(1));
    const batch = (api.recordSwipes as jest.Mock).mock.calls[0][0];
    expect(batch).toHaveLength(10);
    expect(batch[9]).toEqual({ listing_id: 'id-9', dir: 'save', at: NOW.toISOString() });
    await waitFor(() => expect(store.getState().queue).toHaveLength(0));
  });

  it('keeps the queue when offline and persists it', async () => {
    const storage = memory();
    const api = fakeApi({
      recordSwipes: jest.fn(async () => Promise.reject(new Error('offline'))),
    });
    const store = createSwipeStore(storage, api, () => NOW);
    store.getState().swipe('a', 'left');
    await store.getState().flush();
    expect(store.getState().queue).toHaveLength(1);
    expect(parseQueue(storage.get())).toHaveLength(1);
    // A new session reads the stored queue back.
    const again = createSwipeStore(storage, fakeApi(), () => NOW);
    expect(again.getState().queue.map((q) => q.listing_id)).toEqual(['a']);
  });

  it('caps the offline queue at 200, keeping the newest', () => {
    let q: QueuedSwipe[] = [];
    for (let i = 0; i < 250; i++) q = enqueue(q, swipe(`id-${i}`, NOW));
    expect(q).toHaveLength(QUEUE_CAP);
    expect(q[0]!.listing_id).toBe('id-50');
    expect(
      enqueue(q, swipe('id-60', NOW, 'save')).filter((s) => s.listing_id === 'id-60'),
    ).toHaveLength(1);
  });

  it('undo within 5 s drops the pending swipe, later it is too late', async () => {
    let now = NOW;
    const api = fakeApi();
    const store = createSwipeStore(memory(), api, () => now);
    store.getState().swipe('a', 'left');
    now = new Date(NOW.getTime() + 4000);
    await expect(store.getState().undo()).resolves.toBe('a');
    expect(store.getState().queue).toHaveLength(0);
    expect(api.undoSwipe).not.toHaveBeenCalled();

    now = NOW;
    store.getState().swipe('b', 'left');
    now = new Date(NOW.getTime() + 6000);
    await expect(store.getState().undo()).resolves.toBeNull();
    expect(store.getState().queue).toHaveLength(1);
  });

  it('undo after the batch was sent calls undo_swipe', async () => {
    const api = fakeApi();
    const store = createSwipeStore(memory(), api, () => NOW);
    store.getState().swipe('a', 'save');
    await store.getState().flush();
    await expect(store.getState().undo()).resolves.toBe('a');
    expect(api.undoSwipe).toHaveBeenCalledWith('a');
  });

  it('plans undo from the queue', () => {
    const s = swipe('a', NOW);
    expect(undoPlan([s], s, NOW).kind).toBe('local');
    expect(undoPlan([], s, NOW).kind).toBe('server');
    expect(undoPlan([s], null, NOW).kind).toBe('expired');
  });

  it('sends a right swipe as seen (left) and ignores junk in storage', () => {
    expect(toServer(swipe('a', NOW, 'right')).dir).toBe('left');
    expect(
      parseQueue([{ listing_id: 'a', dir: 'up', at: 'x' }, swipe('b', NOW), null]),
    ).toHaveLength(1);
    expect(parseQueue('nope')).toEqual([]);
  });
});

describe('feed logic', () => {
  it('pages by the last card of a full page', () => {
    const page = [item(1), item(2)];
    expect(nextCursor(page, 2)).toEqual({ bumped_at: page[1]!.bumped_at, id: page[1]!.id });
    expect(nextCursor(page, 20)).toBeNull();
  });

  it('merges pages without repeats or swiped cards', () => {
    expect(
      mergePage([item(1)], [item(1), item(2), item(3)], new Set([item(3).id])).map((i) => i.title),
    ).toEqual(['Item 1', 'Item 2']);
  });

  it('builds a deck card', () => {
    const c = toDeckCard(item(5, { kind: 'free', price_cents: 0 }), 'http://m/', NOW);
    expect(c.price).toBe(feed.free);
    expect(c.photos[0]!.uri).toBe('http://m/c/x/l/5/a.webp');
    expect(c.meta).toBe('Good · 5 minutes ago');
  });
});

// ---------------------------------------------------------------------------
// Screens

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
      'listing/[id]/index': () => <Stub id="screen-listing-stub" />,
      search: () => <Stub id="screen-search" />,
      sell: () => <Stub id="screen-sell" />,
      ...routes,
    },
    { initialUrl, wrapper },
  );
}

describe('B01 Discover', () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    useToastStore.setState({ current: undefined });
  });
  afterEach(() => jest.restoreAllMocks());

  const coachSeen = { seen: () => true, markSeen: jest.fn() };
  const discover = (api: FeedApi, coach = coachSeen) => {
    const swipes = createSwipeStore(memory(), api, () => NOW);
    render(
      {
        discover: () => (
          <DiscoverScreen
            api={api}
            swipes={swipes}
            coach={coach}
            mediaBase={() => 'http://m'}
            now={() => NOW}
          />
        ),
      },
      '/discover',
    );
    return swipes;
  };

  it('shows the deck, and skipping offers undo that brings the card back', async () => {
    const page = Array.from({ length: 20 }, (_, i) => item(i + 1));
    const api = fakeApi({ getFeed: jest.fn(async (c) => (c ? [] : page)) });
    const swipes = discover(api);
    expect(await screen.findByTestId('deck-card-' + page[0]!.id)).toBeTruthy();
    fireEvent.press(screen.getByTestId('deck-skip'));
    await waitFor(() => expect(screen.getByTestId('deck-card-' + page[1]!.id)).toBeTruthy());
    expect(swipes.getState().queue.map((q) => q.listing_id)).toEqual([page[0]!.id]);
    expect(useToastStore.getState().current?.message).toBe(feed.undoSkipped);
    await act(async () => useToastStore.getState().current?.onUndo?.());
    await waitFor(() => expect(screen.getByTestId('deck-card-' + page[0]!.id)).toBeTruthy());
    expect(swipes.getState().queue).toHaveLength(0);
  });

  it('save calls save_listing right away', async () => {
    const page = Array.from({ length: 20 }, (_, i) => item(i + 1));
    const api = fakeApi({ getFeed: jest.fn(async (c) => (c ? [] : page)) });
    discover(api);
    await screen.findByTestId('deck-card-' + page[0]!.id);
    fireEvent.press(screen.getByTestId('deck-save'));
    await waitFor(() => expect(api.save).toHaveBeenCalledWith(page[0]!.id));
  });

  it('the $ button opens the listing for an offer', async () => {
    const page = Array.from({ length: 20 }, (_, i) => item(i + 1));
    const api = fakeApi({ getFeed: jest.fn(async (c) => (c ? [] : page)) });
    discover(api);
    await screen.findByTestId('deck-card-' + page[0]!.id);
    fireEvent.press(screen.getByTestId('deck-offer'));
    expect(await screen.findByTestId('screen-listing-stub')).toBeTruthy();
  });

  it('fetches the next page when few cards are left', async () => {
    const api = fakeApi({
      getFeed: jest.fn(async (c) =>
        c ? [item(99)] : Array.from({ length: 20 }, (_, i) => item(i + 1)),
      ),
    });
    discover(api);
    await screen.findByTestId('deck-card-' + item(1).id);
    expect(api.getFeed).toHaveBeenCalledTimes(1);
  });

  it('shows the first-swipe coach once', async () => {
    const api = fakeApi({ getFeed: jest.fn(async () => [item(1)]) });
    const coach = { seen: () => false, markSeen: jest.fn() };
    discover(api, coach);
    expect(await screen.findByTestId('discover-coach')).toBeTruthy();
    fireEvent.press(screen.getByText(feed.coachOk));
    expect(coach.markSeen).toHaveBeenCalled();
    expect(screen.queryByTestId('discover-coach')).toBeNull();
  });

  it('day one: a nearly empty campus gets the hero', async () => {
    discover(fakeApi({ getFeed: jest.fn(async () => []) }));
    expect(await screen.findByTestId('discover-day-one')).toBeTruthy();
    fireEvent.press(screen.getByText(feed.endSell));
    expect(await screen.findByTestId('screen-sell')).toBeTruthy();
  });

  it('end of deck after swiping through a busy campus', async () => {
    const page = Array.from({ length: 12 }, (_, i) => item(i + 1));
    const api = fakeApi({ getFeed: jest.fn(async (c) => (c ? [] : page)) });
    discover(api);
    await screen.findByTestId('deck-card-' + page[0]!.id);
    // Step past the 500 ms double-tap guard between presses.
    let t = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => (t += 1000));
    for (const p of page) {
      await waitFor(() => expect(screen.getByTestId('deck-card-' + p.id)).toBeTruthy());
      fireEvent.press(screen.getByTestId('deck-skip'));
    }
    expect(await screen.findByTestId('discover-end')).toBeTruthy();
  });

  it('shows an error with retry', async () => {
    const getFeed = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue([item(1)]);
    discover(fakeApi({ getFeed }));
    expect(await screen.findByTestId('discover-error')).toBeTruthy();
  });
});

describe('B02 Listing', () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });
  afterEach(() => jest.restoreAllMocks());

  const listing = (api: FeedApi) =>
    render(
      {
        'listing/[id]/index': () => (
          <ListingScreen
            id="L1"
            api={api}
            spots={async () => []}
            mediaBase={() => 'http://m'}
            site={() => 'https://site'}
            share={jest.fn(async () => {})}
            now={() => NOW}
          />
        ),
        'listing/[id]/offer': () => <Stub id="screen-offer" />,
        discover: () => <Stub id="screen-discover" />,
      },
      '/listing/L1',
    );

  it('buyer: records a view, saves and goes to the offer', async () => {
    const api = fakeApi({
      getListing: jest.fn(async () => ({ ...item(1), access: 'buyer' }) as ListingResult),
    });
    listing(api);
    expect(await screen.findByTestId('screen-listing')).toBeTruthy();
    await waitFor(() => expect(api.recordView).toHaveBeenCalledWith('L1'));
    fireEvent.press(screen.getByTestId('listing-save'));
    await waitFor(() => expect(api.save).toHaveBeenCalledWith('L1'));
    fireEvent.press(screen.getByTestId('listing-offer'));
    expect(await screen.findByTestId('screen-offer')).toBeTruthy();
  });

  it('owner: stats, no view recorded', async () => {
    const api = fakeApi({
      getListing: jest.fn(
        async () => ({ ...item(1, { view_count: 7 }), access: 'owner' }) as ListingResult,
      ),
    });
    listing(api);
    expect(await screen.findByTestId('listing-owner-stats')).toBeTruthy();
    expect(screen.getByText('7 views')).toBeTruthy();
    expect(api.recordView).not.toHaveBeenCalled();
  });

  it('on hold: "Tell me" watches it', async () => {
    const api = fakeApi({
      getListing: jest.fn(
        async () => ({ ...item(1, { status: 'hold' }), access: 'buyer' }) as ListingResult,
      ),
    });
    listing(api);
    fireEvent.press(await screen.findByTestId('listing-watch'));
    await waitFor(() => expect(api.watch).toHaveBeenCalledWith('L1'));
    expect(await screen.findByText(feed.watching)).toBeTruthy();
  });

  it.each([
    ['gone', feed.goneTitle],
    ['blocked', feed.blockedTitle],
    ['other_campus', feed.otherCampusTitle],
  ])('%s state', async (access, title) => {
    listing(fakeApi({ getListing: jest.fn(async () => ({ id: 'L1', access }) as ListingResult) }));
    expect(await screen.findByTestId(`screen-listing-${access}`)).toBeTruthy();
    expect(screen.getByText(title)).toBeTruthy();
  });

  it('options: not interested hides it', async () => {
    const api = fakeApi({
      getListing: jest.fn(async () => ({ ...item(1), access: 'buyer' }) as ListingResult),
    });
    listing(api);
    fireEvent.press(await screen.findByTestId('listing-more'));
    fireEvent.press(await screen.findByText(feed.notInterested));
    await waitFor(() => expect(api.hide).toHaveBeenCalledWith('L1'));
  });
});
