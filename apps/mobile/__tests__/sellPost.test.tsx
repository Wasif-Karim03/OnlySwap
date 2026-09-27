import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import type { PostedListing, SellApi } from '../src/features/sell/api';
import { createDraftStore } from '../src/features/sell/draft';
import {
  chosenSpots,
  createArgs,
  directionsUrl,
  emptyDraft,
  listingLink,
  priceLabel,
  sortSpots,
  toggleSpot,
  type DraftPhoto,
  type SellDraft,
  type Spot,
} from '../src/features/sell/logic';
import { usePostedStore } from '../src/features/sell/posted';
import { SellMeetupScreen } from '../src/features/sell/SellMeetupScreen';
import { SellPostedScreen } from '../src/features/sell/SellPostedScreen';
import { sell } from '../src/strings/en';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => 'file:///card.jpg'),
}));

const NOW = new Date('2027-03-10T12:00:00');

const spot = (id: string, over: Partial<Spot> = {}): Spot => ({
  id,
  name: `Spot ${id}`,
  description: 'Inside the main entrance',
  hours: '7am to midnight',
  lat: 40,
  lng: -83,
  police: false,
  isDefault: false,
  sort: 1,
  ...over,
});
const SPOTS = [
  spot('lib', { name: 'Thompson Library lobby', isDefault: true, sort: 1 }),
  spot('rpac', { name: 'RPAC entrance', sort: 3 }),
  spot('pd', { name: 'OSU Police lobby', police: true, sort: 9 }),
];
const photo = (id: string, status: DraftPhoto['status'] = 'done'): DraftPhoto => ({
  id,
  uri: `file:///${id}.jpg`,
  width: 1080,
  height: 810,
  status,
  ...(status === 'done'
    ? { path: `c/x/l/L1/${id}_full.webp`, thumbPath: `c/x/l/L1/${id}_thumb.webp`, blurhash: 'LEHV' }
    : {}),
});
const draftWith = (over: Partial<SellDraft> = {}): SellDraft => ({
  ...emptyDraft(NOW),
  listingId: 'L1',
  photos: [photo('a'), photo('b')],
  title: ' Desk lamp ',
  categoryId: 1,
  condition: 'good',
  price: '12',
  ...over,
});

// ---------------------------------------------------------------------------------------------
describe('P5-SELL-04 step 3 rules', () => {
  it('police-designated spots come first, then the campus order', () => {
    expect(sortSpots(SPOTS).map((s) => s.id)).toEqual(['pd', 'lib', 'rpac']);
  });

  it('the campus default is chosen until the seller picks; up to 5', () => {
    expect(chosenSpots({ spotIds: null }, SPOTS)).toEqual(['lib']);
    expect(chosenSpots({ spotIds: [] }, SPOTS)).toEqual([]);
    expect(chosenSpots({ spotIds: ['rpac', 'gone'] }, SPOTS)).toEqual(['rpac']);
    expect(toggleSpot(['a'], 'a')).toEqual([]);
    expect(toggleSpot(['a', 'b', 'c', 'd'], 'e')).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(toggleSpot(['a', 'b', 'c', 'd', 'e'], 'f')).toBeNull();
  });

  it('Directions opens Maps without a location permission', () => {
    expect(directionsUrl({ lat: 40, lng: -83, name: 'RPAC entrance' }, 'ios')).toBe(
      'https://maps.apple.com/?daddr=40,-83&q=RPAC%20entrance',
    );
    expect(directionsUrl({ lat: 40, lng: -83, name: 'RPAC' }, 'android')).toBe(
      'geo:40,-83?q=40,-83(RPAC)',
    );
  });

  it('create_listing arguments: trimmed, uploaded photos only, give-away gets a pickup day and $0', () => {
    const sale = createArgs(
      draftWith({ photos: [photo('a'), photo('b', 'failed')], meetNote: '  ' }),
      ['lib'],
      NOW,
    );
    expect(sale).toEqual({
      id: 'L1',
      kind: 'sale',
      title: 'Desk lamp',
      description: null,
      category_id: 1,
      condition: 'good',
      price_cents: 1200,
      open_to_offers: true,
      photos: [
        {
          path: 'c/x/l/L1/a_full.webp',
          thumb_path: 'c/x/l/L1/a_thumb.webp',
          width: 1080,
          height: 810,
          blurhash: 'LEHV',
        },
      ],
      meet_spot_ids: ['lib'],
      meet_note: null,
      availability: [],
      pickup_by: null,
    });
    const free = createArgs(
      draftWith({ kind: 'free', pickupBy: 'tomorrow', openToOffers: false }),
      [],
      NOW,
    );
    expect([free.price_cents, free.category_id, free.pickup_by, free.open_to_offers]).toEqual([
      0,
      null,
      '2027-03-11',
      true,
    ]);
    expect(() => createArgs(draftWith({ listingId: null }), [])).toThrow();
  });

  it('price labels and the listing link', () => {
    expect(priceLabel('sale', 6000, 'Free')).toBe('$60');
    expect(priceLabel('sale', 1250, 'Free')).toBe('$12.50');
    expect(priceLabel('sale', 150000, 'Free')).toBe('$1,500');
    expect(priceLabel('free', 0, 'Free')).toBe('Free');
    expect(listingLink('https://onlyswap.pages.dev/', 'L1')).toBe(
      'https://onlyswap.pages.dev/l/L1',
    );
  });
});

// ---------------------------------------------------------------------------------------------
const POSTED: PostedListing = {
  id: 'L1',
  status: 'active',
  kind: 'sale',
  title: 'Desk lamp',
  price_cents: 1200,
  condition: 'good',
  photos: [{ path: 'c/x/l/L1/a_full.webp', thumb_path: 'c/x/l/L1/a_thumb.webp', blurhash: null }],
};

function fakeApi(over: Partial<Record<keyof SellApi, jest.Mock>> = {}) {
  const api = {
    reserveListingId: jest.fn(async () => 'L1'),
    uploadPhoto: jest.fn(),
    checkText: jest.fn(async () => ({ result: 'ok', term: null })),
    categories: jest.fn(async () => [{ id: 1, name: 'Dorm & furniture', parentId: null }]),
    spots: jest.fn(async () => SPOTS),
    campusName: jest.fn(async () => 'Ohio State'),
    createListing: jest.fn(async () => POSTED),
    uploadShareCard: jest.fn(async () => {}),
    ...over,
  };
  return api as unknown as SellApi & typeof api;
}

function Stub({ id }: { id: string }) {
  return (
    <View testID={id}>
      <Text>{id}</Text>
    </View>
  );
}

function setup(initialUrl: string, routes: Record<string, () => ReactNode>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderRouter(
    {
      index: () => <Stub id="screen-index" />,
      discover: () => <Stub id="screen-discover" />,
      ...routes,
    },
    { initialUrl, wrapper },
  );
}

const tap = (id: string) => {
  act(() => {
    jest.advanceTimersByTime(600);
  });
  fireEvent.press(screen.getByTestId(id));
};

function storeWith(draft: SellDraft) {
  const store = createDraftStore(
    { get: () => draft, set: () => {}, remove: () => {} },
    { now: () => NOW },
  );
  store.getState().keep();
  return store;
}

describe('P5-SELL-04 D03 Sell · meetup', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    usePostedStore.getState().clear();
  });
  afterEach(() => jest.useRealTimers());

  const routes = (
    api: SellApi,
    store: ReturnType<typeof createDraftStore>,
    openUrl = jest.fn(async () => true),
  ) => ({
    'sell/meetup': () => (
      <SellMeetupScreen
        api={api}
        store={store}
        openUrl={openUrl}
        mediaBase={() => 'http://media.test'}
      />
    ),
    'sell/posted': () => <Stub id="screen-posted-stub" />,
  });

  it('lists spots police-designated first, with the tag and Directions', async () => {
    const openUrl = jest.fn(async () => true);
    setup('/sell/meetup', routes(fakeApi(), storeWith(draftWith()), openUrl));
    expect(await screen.findByText('OSU Police lobby')).toBeTruthy();
    expect(screen.getByText(sell.police)).toBeTruthy();
    const names = screen
      .getAllByText(/Thompson Library lobby|RPAC entrance|OSU Police lobby/)
      .map((n) => n.props.children);
    // The last match is the preview line (condition · category · first spot).
    expect(names.slice(0, 3)).toEqual([
      'OSU Police lobby',
      'Thompson Library lobby',
      'RPAC entrance',
    ]);
    expect(screen.getByTestId('sell-spot-lib').props.accessibilityState).toEqual({ checked: true });
    fireEvent.press(screen.getAllByText(sell.directions)[0] as never);
    expect(openUrl).toHaveBeenCalledWith(expect.stringContaining('maps.apple.com'));
  });

  it('Post needs the banned-items confirmation, then posts spots, place and times, and opens Posted', async () => {
    const api = fakeApi();
    const store = storeWith(draftWith());
    const router = setup('/sell/meetup', routes(api, store));
    await screen.findByText('RPAC entrance');
    tap('sell-spot-rpac');
    fireEvent.changeText(screen.getByTestId('sell-meet-note'), 'Lobby of Morrill Tower');
    fireEvent.press(screen.getByLabelText(sell.availability.evenings));
    tap('sell-post');
    expect(await screen.findByTestId('sell-confirm-hint')).toBeTruthy();
    expect(api.createListing).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText(sell.notBanned));
    tap('sell-post');
    await waitFor(() => expect(router.getPathname()).toBe('/sell/posted'));
    expect(api.createListing).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'L1',
        meet_spot_ids: ['lib', 'rpac'],
        meet_note: 'Lobby of Morrill Tower',
        availability: ['evenings'],
      }),
    );
    expect(usePostedStore.getState().listing?.id).toBe('L1');
    expect(usePostedStore.getState().coverUri).toBe('file:///a.jpg');
    expect(store.getState().draft.listingId).toBeNull();
  });

  it('a sixth spot is refused; Decide in chat clears them', async () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      spot(`s${i}`, { name: `Spot number ${i}`, sort: i }),
    );
    const store = storeWith(draftWith({ spotIds: ['s0', 's1', 's2', 's3', 's4'] }));
    setup('/sell/meetup', routes(fakeApi({ spots: jest.fn(async () => many) }), store));
    await screen.findByText('Spot number 5');
    tap('sell-spot-s5');
    expect(screen.getByText(sell.spotsMax)).toBeTruthy();
    tap('sell-spot-chat');
    expect(store.getState().draft.spotIds).toEqual([]);
  });

  it('a failed post keeps the draft and says so', async () => {
    const api = fakeApi({
      createListing: jest.fn().mockRejectedValue({ code: 'P0001', message: 'BANNED_TERM:vape' }),
    });
    const store = storeWith(draftWith());
    const router = setup('/sell/meetup', routes(api, store));
    await screen.findByText('RPAC entrance');
    fireEvent.press(screen.getByLabelText(sell.notBanned));
    tap('sell-post');
    expect(await screen.findByTestId('sell-post-error')).toBeTruthy();
    expect(router.getPathname()).toBe('/sell/meetup');
    expect(store.getState().draft.listingId).toBe('L1');
  });
});

describe('P5-SELL-05 D04 Posted + share card', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    usePostedStore.getState().clear();
  });
  afterEach(() => jest.useRealTimers());

  const routes = (props: Partial<Parameters<typeof SellPostedScreen>[0]>) => ({
    'sell/posted': () => (
      <SellPostedScreen
        site={() => 'https://onlyswap.pages.dev'}
        mediaBase={() => 'http://media.test'}
        cardTimeoutMs={50}
        {...props}
      />
    ),
    'sell/index': () => <Stub id="screen-sell-stub" />,
  });

  it('makes the share card, records it, and shares the listing link', async () => {
    usePostedStore.getState().set(POSTED, null);
    const api = fakeApi();
    const capture = jest.fn(async () => 'file:///card.jpg');
    const share = jest.fn(async () => ({}));
    setup('/sell/posted', routes({ api, capture, share }));
    expect(await screen.findByText(sell.postedTitle)).toBeTruthy();
    await waitFor(() => expect(api.uploadShareCard).toHaveBeenCalledWith('L1', 'file:///card.jpg'));
    await waitFor(() => expect(screen.queryByTestId('sell-card-preparing')).toBeNull());
    expect(screen.queryByTestId('sell-card-failed')).toBeNull();
    tap('sell-share');
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(share.mock.calls[0])).toContain('https://onlyswap.pages.dev/l/L1');
    expect(JSON.stringify(share.mock.calls[0])).toContain('Desk lamp · $12 on OnlySwap');
  });

  it('T-UNIT-MEDIA-06: a failed capture still lets the seller share', async () => {
    usePostedStore.getState().set(POSTED, null);
    const api = fakeApi();
    const share = jest.fn(async () => ({}));
    setup(
      '/sell/posted',
      routes({ api, capture: jest.fn().mockRejectedValue(new Error('no view')), share }),
    );
    expect(await screen.findByTestId('sell-card-failed')).toBeTruthy();
    expect(api.uploadShareCard).not.toHaveBeenCalled();
    tap('sell-share');
    await waitFor(() => expect(share).toHaveBeenCalled());
  });

  it('held for review: says so and does not offer Share; List another starts over', async () => {
    usePostedStore.getState().set({ ...POSTED, status: 'held_review' }, null);
    const router = setup(
      '/sell/posted',
      routes({ api: fakeApi(), capture: jest.fn(async () => 'x') }),
    );
    expect(await screen.findByText(sell.reviewTitle)).toBeTruthy();
    expect(screen.queryByTestId('sell-share')).toBeNull();
    tap('sell-list-another');
    await waitFor(() => expect(router.getPathname()).toBe('/sell'));
    expect(usePostedStore.getState().listing).toBeNull();
  });
});
