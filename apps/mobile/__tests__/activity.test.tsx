import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { AccessibilityInfo, AppState, Text } from 'react-native';

import type { FeedApi } from '../src/features/feed/api';
import { DiscoverScreen } from '../src/features/feed/DiscoverScreen';
import { ListingScreen } from '../src/features/feed/ListingScreen';
import type { FeedItem, ListingResult, QueuedSwipe } from '../src/features/feed/logic';
import { createSwipeStore } from '../src/features/feed/swipes';
import {
  BATCH_MAX,
  DWELL_MAX,
  FLUSH_MS,
  HOURLY_MAX,
  MAX_AGE_MS,
  QUEUE_MAX,
  backoffMs,
  createActivityQueue,
  makeEvent,
  startActivity,
  setActivityQueue,
  toAppVersion,
  toPlatform,
  toSource,
  track,
  type ActivityQueue,
  type PersistedQueue,
  type TrackEventsArgs,
} from '../src/lib/activity';
import { getStorage } from '../src/lib/storage';

// Screens import '@/lib/activity'; spy on `track` there and keep the rest real.
jest.mock('../src/lib/activity', () => ({
  ...jest.requireActual('../src/lib/activity'),
  track: jest.fn(),
}));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const T0 = Date.parse('2027-03-10T12:00:00Z');
const L = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

type Harness = {
  q: ActivityQueue;
  send: jest.Mock<Promise<unknown>, [TrackEventsArgs]>;
  stored: { value: PersistedQueue | null };
  clock: { t: number };
};

function harness(opts: { initial?: unknown; send?: jest.Mock } = {}): Harness {
  const clock = { t: T0 };
  const stored = { value: (opts.initial ?? null) as PersistedQueue | null };
  const send = (opts.send ?? jest.fn(async () => ({ accepted: 1 }))) as Harness['send'];
  const q = createActivityQueue({
    send,
    load: () => stored.value,
    save: (v) => void (stored.value = v),
    platform: 'ios',
    appVersion: '1.4.0',
    now: () => clock.t,
  });
  return { q, send, stored, clock };
}

describe('T-UNIT-LIB-ACT-01 activity queue (DEC 93, track_events)', () => {
  beforeEach(() => jest.useFakeTimers({ now: T0 }));
  afterEach(() => jest.useRealTimers());

  it('sends the exact RPC args: events, platform, app_version', async () => {
    const h = harness();
    h.q.start('u1');
    h.q.track('listing_viewed', {
      listingId: L(1),
      source: 'search',
      dwellMs: 4321.6,
      at: new Date(T0 - 5000),
    });
    h.q.track('searched', { query: '  mini   fridge  ', source: 'search' });
    h.q.track('app_open');
    await h.q.flush();
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send.mock.calls[0]![0]).toEqual({
      events: [
        {
          kind: 'listing_viewed',
          listing_id: L(1),
          source: 'search',
          dwell_ms: 4322,
          at: new Date(T0 - 5000).toISOString(),
        },
        {
          kind: 'searched',
          source: 'search',
          query: 'mini fridge',
          at: new Date(T0).toISOString(),
        },
        { kind: 'app_open', at: new Date(T0).toISOString() },
      ],
      platform: 'ios',
      app_version: '1.4.0',
    });
    expect(h.q.pending()).toEqual([]);
    expect(h.stored.value).toBeNull();
  });

  it('builds only events the server keeps', () => {
    expect(makeEvent('deck_shown', {}, T0)).toBeNull(); // needs a listing
    expect(makeEvent('searched', { query: '   ' }, T0)).toBeNull(); // needs text
    expect(makeEvent('nope' as never, {}, T0)).toBeNull();
    expect(makeEvent('saved', { listingId: 'x', dwellMs: 10 ** 9 }, T0)?.dwell_ms).toBe(DWELL_MAX);
    expect(makeEvent('saved', { listingId: 'x', dwellMs: -1 }, T0)).not.toHaveProperty('dwell_ms');
    expect(makeEvent('searched', { query: 'a'.repeat(200) }, T0)?.query).toHaveLength(80);
    // app_open carries no listing even if one is passed
    expect(makeEvent('app_open', { listingId: 'x' }, T0)).not.toHaveProperty('listing_id');
    expect(
      makeEvent('listing_viewed', { listingId: 'x', source: 'chat' as never }, T0),
    ).not.toHaveProperty('source');
  });

  it('51 events go out as two batches (50 + 1)', async () => {
    const h = harness();
    h.q.start('u1');
    for (let i = 0; i < 51; i++) h.q.track('deck_shown', { listingId: L(i), source: 'discover' });
    await h.q.flush();
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.send.mock.calls[0]![0].events).toHaveLength(BATCH_MAX);
    expect(h.send.mock.calls[1]![0].events).toHaveLength(1);
    expect(h.send.mock.calls[1]![0].events[0]!.listing_id).toBe(L(50));
  });

  it('flushes on its own at 50 waiting and every 15 s', async () => {
    const h = harness();
    h.q.start('u1');
    for (let i = 0; i < 49; i++) h.q.track('deck_shown', { listingId: L(i) });
    expect(h.send).not.toHaveBeenCalled();
    h.q.track('deck_shown', { listingId: L(49) });
    await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(h.q.pending()).toHaveLength(0));

    h.q.track('app_open');
    await jest.advanceTimersByTimeAsync(FLUSH_MS - 1);
    expect(h.send).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(h.send).toHaveBeenCalledTimes(2);
  });

  it('keeps unsent events in storage and picks them up after a restart', async () => {
    const offline = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const a = harness({ send: offline });
    a.q.start('u1');
    a.q.track('saved', { listingId: L(1), dwellMs: 900, source: 'discover' });
    await a.q.flush();
    expect(a.stored.value?.owner).toBe('u1');
    expect(a.stored.value?.events).toHaveLength(1);

    // New launch, same user: the saved event is sent.
    const b = harness({ initial: a.stored.value });
    b.q.start('u1');
    expect(b.q.pending()).toEqual(a.stored.value!.events);
    await b.q.flush();
    expect(b.send.mock.calls[0]![0].events[0]).toMatchObject({ kind: 'saved', dwell_ms: 900 });

    // Someone else signs in on this phone: the old queue is not theirs.
    const c = harness({ initial: a.stored.value });
    c.q.start('u2');
    expect(c.q.pending()).toEqual([]);
  });

  it('drops events older than 24 h and keeps the newest 500', async () => {
    const old: PersistedQueue = {
      owner: 'u1',
      events: [
        { kind: 'app_open', at: new Date(T0 - MAX_AGE_MS - 1).toISOString() },
        { kind: 'app_open', at: new Date(T0 - 1000).toISOString() },
      ],
    };
    const h = harness({ initial: old });
    h.q.start('u1');
    expect(h.q.pending()).toHaveLength(1);

    // Cap: offline, so nothing leaves; only the newest QUEUE_MAX stay.
    h.send.mockRejectedValue(new TypeError('Network request failed'));
    for (let i = 0; i < QUEUE_MAX + 20; i++) h.q.track('deck_shown', { listingId: L(i) });
    await h.q.flush();
    const left = h.q.pending();
    expect(left).toHaveLength(QUEUE_MAX);
    expect(left[left.length - 1]!.listing_id).toBe(L(QUEUE_MAX + 19));
  });

  it('sign-out clears the queue and storage and stops tracking', async () => {
    const h = harness();
    track('app_open'); // the app-level helper is mocked; a no-op here
    h.q.track('app_open'); // not signed in yet
    expect(h.q.pending()).toEqual([]);
    h.q.start('u1');
    h.q.track('app_open');
    expect(h.stored.value?.events).toHaveLength(1);
    h.q.stop();
    expect(h.q.pending()).toEqual([]);
    expect(h.stored.value).toBeNull();
    h.q.track('app_open');
    await jest.advanceTimersByTimeAsync(FLUSH_MS * 2);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('retries network errors with backoff, drops a batch the server rejects', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValue({ accepted: 1 });
    const h = harness({ send });
    h.q.start('u1');
    h.q.track('app_open');
    await h.q.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(h.q.pending()).toHaveLength(1);

    h.clock.t += backoffMs(1) - 1;
    await h.q.flush(); // still backing off
    expect(send).toHaveBeenCalledTimes(1);
    h.clock.t += 1;
    await h.q.flush(); // fails again, longer wait
    expect(send).toHaveBeenCalledTimes(2);
    expect(backoffMs(2)).toBe(2 * backoffMs(1));
    h.clock.t += backoffMs(2);
    await h.q.flush();
    expect(send).toHaveBeenCalledTimes(3);
    expect(h.q.pending()).toEqual([]);

    // A rate limit waits until the server's retry time.
    const retryAt = new Date(T0 + 3600_000).toISOString();
    send.mockRejectedValueOnce({ code: 'P0001', message: `RATE_LIMITED:track_events:${retryAt}` });
    h.q.track('app_open');
    await h.q.flush();
    h.clock.t += backoffMs(1);
    await h.q.flush();
    expect(send).toHaveBeenCalledTimes(4);
    expect(h.q.pending()).toHaveLength(1);

    // Anything else (here INVALID) drops the batch instead of looping on it.
    const bad = harness({
      send: jest.fn().mockRejectedValue({ code: 'P0001', message: 'INVALID:events' }),
    });
    bad.q.start('u1');
    bad.q.track('app_open');
    await bad.q.flush();
    expect(bad.q.pending()).toEqual([]);
  });

  it('keeps under the hourly limit', async () => {
    const h = harness();
    h.q.start('u1');
    for (let i = 0; i < HOURLY_MAX + 1; i++) {
      h.q.track('app_open');
      await h.q.flush();
    }
    expect(h.send).toHaveBeenCalledTimes(HOURLY_MAX);
    h.clock.t += 3600_000;
    await h.q.flush();
    expect(h.send).toHaveBeenCalledTimes(HOURLY_MAX + 1);
  });

  it('never throws into the UI', () => {
    const q = createActivityQueue({
      send: jest.fn(),
      load: () => {
        throw new Error('bad storage');
      },
      save: () => {
        throw new Error('disk full');
      },
      platform: 'ios',
      appVersion: '1.0.0',
    });
    expect(() => q.start('u1')).not.toThrow();
    expect(() => q.track('app_open')).not.toThrow();
    q.stop();
  });

  it('maps platform, version and the from param', () => {
    expect(toPlatform('ios')).toBe('ios');
    expect(toPlatform('web')).toBe('web');
    expect(toPlatform('windows')).toBeNull();
    expect(toAppVersion('1.4.0')).toBe('1.4.0');
    expect(toAppVersion('1.4.0 (beta)')).toBeNull();
    expect(toSource('search')).toBe('search');
    expect(toSource(['saved'])).toBe('saved');
    expect(toSource('chat')).toBeUndefined();
    expect(toSource(undefined)).toBeUndefined();
  });

  it('the activity.queue key round-trips through app storage', () => {
    const v: PersistedQueue = {
      owner: 'u1',
      events: [{ kind: 'app_open', at: '2027-01-01T00:00:00.000Z' }],
    };
    getStorage().set('activity.queue', v);
    expect(getStorage().get('activity.queue')).toEqual(v);
    getStorage().remove('activity.queue');
    expect(getStorage().get('activity.queue')).toBeUndefined();
  });
});

describe('T-UNIT-LIB-ACT-02 startActivity', () => {
  afterEach(() => setActivityQueue(null));

  it('is off under Jest without a queue', () => {
    expect(startActivity({ onAuthStateChange: jest.fn() } as never)).toEqual(expect.any(Function));
  });

  it('follows sign-in and sign-out, app_open once, flushes on background', () => {
    const q = {
      start: jest.fn(),
      stop: jest.fn(),
      track: jest.fn(),
      flush: jest.fn(async () => {}),
      pending: () => [],
      userId: () => null,
    };
    setActivityQueue(q);
    let cb: (e: string, s: unknown) => void = () => {};
    const unsubscribe = jest.fn();
    const listeners: ((s: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_t, fn) => {
      listeners.push(fn as (s: string) => void);
      return { remove: jest.fn() } as never;
    });
    let t = T0;
    const stop = startActivity(
      {
        onAuthStateChange: (fn: typeof cb) => {
          cb = fn;
          return { data: { subscription: { unsubscribe } } };
        },
      } as never,
      () => t,
    );
    cb('INITIAL_SESSION', { user: { id: 'u1' } });
    cb('SIGNED_IN', { user: { id: 'u1' } });
    expect(q.start).toHaveBeenCalledWith('u1');
    expect(q.track.mock.calls.filter((c) => c[0] === 'app_open')).toHaveLength(1);

    listeners.forEach((l) => l('background'));
    expect(q.flush).toHaveBeenCalled();
    t += 31 * 60_000;
    listeners.forEach((l) => l('active'));
    expect(q.track.mock.calls.filter((c) => c[0] === 'app_open')).toHaveLength(2);

    cb('SIGNED_OUT', null);
    expect(q.stop).toHaveBeenCalled();
    stop();
    expect(unsubscribe).toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// Screens: where events fire.

const NOW = new Date(T0);
const trackMock = track as jest.MockedFunction<typeof track>;

function item(n: number, patch: Partial<FeedItem> = {}): FeedItem {
  return {
    id: L(n),
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
    bumped_at: NOW.toISOString(),
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
      'listing/[id]/offer': () => <Stub id="screen-offer-stub" />,
      ...routes,
    },
    { initialUrl, wrapper },
  );
}

describe('activity events from the screens', () => {
  beforeEach(() => {
    trackMock.mockClear();
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });
  afterEach(() => jest.restoreAllMocks());

  it('Discover sends deck_shown for the top card, then swiped_left with time on card', async () => {
    const page = [item(1), item(2), item(3)];
    const api = fakeApi({ getFeed: jest.fn(async (c) => (c ? [] : page)) });
    let v: unknown;
    const swipes = createSwipeStore(
      { get: () => v, set: (q: QueuedSwipe[]) => void (v = q) },
      api,
      () => NOW,
    );
    render(
      {
        discover: () => (
          <DiscoverScreen
            api={api}
            swipes={swipes}
            coach={{ seen: () => true, markSeen: jest.fn() }}
            mediaBase={() => 'http://m'}
            now={() => NOW}
          />
        ),
      },
      '/discover',
    );
    await screen.findByTestId('deck-card-' + L(1));
    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith('deck_shown', { listingId: L(1), source: 'discover' }),
    );
    // Only the top card counts as shown.
    expect(trackMock.mock.calls.filter((c) => c[0] === 'deck_shown')).toHaveLength(1);

    fireEvent.press(screen.getByTestId('deck-skip'));
    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith('swiped_left', {
        listingId: L(1),
        source: 'discover',
        dwellMs: expect.any(Number),
      }),
    );
    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith('deck_shown', { listingId: L(2), source: 'discover' }),
    );

    fireEvent.press(screen.getByTestId('deck-save'));
    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith('saved', {
        listingId: L(2),
        source: 'discover',
        dwellMs: expect.any(Number),
      }),
    );
  });

  it('Listing sends one listing_viewed with the source and time on page when it closes', async () => {
    const api = fakeApi({
      getListing: jest.fn(async () => ({ ...item(1), access: 'buyer' }) as ListingResult),
    });
    const r = render(
      {
        'listing/[id]/index': () => (
          <ListingScreen
            id="L1"
            from="search"
            api={api}
            spots={async () => []}
            mediaBase={() => 'http://m'}
            site={() => 'https://site'}
            share={jest.fn(async () => {})}
            now={() => NOW}
          />
        ),
      },
      '/listing/L1',
    );
    await screen.findByTestId('screen-listing');
    await waitFor(() => expect(api.recordView).toHaveBeenCalledWith('L1'));
    expect(trackMock.mock.calls.filter((c) => c[0] === 'listing_viewed')).toHaveLength(0);

    fireEvent.press(screen.getByTestId('listing-save'));
    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith('saved', { listingId: 'L1', source: 'search' }),
    );

    r.unmount();
    const views = trackMock.mock.calls.filter((c) => c[0] === 'listing_viewed');
    expect(views).toHaveLength(1);
    expect(views[0]![1]).toEqual({
      listingId: 'L1',
      source: 'search',
      dwellMs: expect.any(Number),
      at: expect.any(Date),
    });
    expect(views[0]![1]!.dwellMs).toBeGreaterThanOrEqual(0);
  });

  it('the owner looking at their own listing sends nothing', async () => {
    const api = fakeApi({
      getListing: jest.fn(async () => ({ ...item(1), access: 'owner' }) as ListingResult),
    });
    const r = render(
      {
        'listing/[id]/index': () => (
          <ListingScreen id="L1" from="profile" api={api} spots={async () => []} now={() => NOW} />
        ),
      },
      '/listing/L1',
    );
    await screen.findByTestId('listing-owner-stats');
    r.unmount();
    expect(trackMock).not.toHaveBeenCalled();
  });
});
