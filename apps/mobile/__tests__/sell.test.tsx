import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import type { SellApi } from '../src/features/sell/api';
import { createDraftStore, DRAFT_SAVE_MS } from '../src/features/sell/draft';
import {
  ago,
  categoryLabel,
  cellAt,
  cleanPrice,
  DRAFT_VERSION,
  emptyDraft,
  listingPriceCents,
  moveItem,
  parseStoredDraft,
  photosState,
  pickupDate,
  priceToCents,
  validateDetails,
  type DraftPhoto,
  type SellDraft,
} from '../src/features/sell/logic';
import { SellDetailsScreen } from '../src/features/sell/SellDetailsScreen';
import { agoText, SellPhotosScreen } from '../src/features/sell/SellPhotosScreen';
import type { OsApi } from '../src/lib/permissions';
import { primer, sell } from '../src/strings/en';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const NOW = new Date('2027-03-10T12:00:00');

function memoryStorage(initial?: unknown) {
  let value: unknown = initial;
  return {
    get: jest.fn(() => value),
    set: jest.fn((v: SellDraft) => {
      value = JSON.parse(JSON.stringify(v));
    }),
    remove: jest.fn(() => {
      value = undefined;
    }),
    peek: () => value,
  };
}

const photo = (id: string, status: DraftPhoto['status'] = 'done'): DraftPhoto => ({
  id,
  uri: `file:///${id}.jpg`,
  width: 1200,
  height: 900,
  status,
  ...(status === 'done'
    ? { path: `c/x/l/y/${id}_full.webp`, thumbPath: `c/x/l/y/${id}_thumb.webp` }
    : {}),
});

// ---------------------------------------------------------------------------------------------
describe('T-UNIT-SELL-01 useDraft', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('autosaves after a short pause, not on every keystroke', () => {
    const storage = memoryStorage();
    const store = createDraftStore(storage, { now: () => NOW });
    store.getState().update({ title: 'D' });
    store.getState().update({ title: 'De' });
    store.getState().update({ title: 'Desk' });
    expect(storage.set).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(DRAFT_SAVE_MS);
    });
    expect(storage.set).toHaveBeenCalledTimes(1);
    expect((storage.peek() as SellDraft).title).toBe('Desk');
    expect(store.getState().savedAt).toBe(NOW.getTime());
  });

  it('comes back after a reload (an app kill), and offers to restore it', () => {
    const storage = memoryStorage();
    const first = createDraftStore(storage, { now: () => NOW });
    first.getState().update({ title: 'Desk lamp', photos: [photo('a'), photo('b', 'uploading')] });
    first.getState().flush();
    const second = createDraftStore(storage, { now: () => NOW });
    expect(second.getState().draft.title).toBe('Desk lamp');
    expect(second.getState().restored).toBe(true);
    expect(second.getState().draft.photos.map((p) => p.status)).toEqual(['done', 'failed']);
    second.getState().keep();
    expect(second.getState().restored).toBe(false);
  });

  it('a draft from another schema version is thrown away', () => {
    const storage = memoryStorage({ ...emptyDraft(NOW), v: DRAFT_VERSION + 1, title: 'Old' });
    const store = createDraftStore(storage, { now: () => NOW });
    expect(store.getState().draft.title).toBe('');
    expect(store.getState().restored).toBe(false);
    expect(storage.remove).toHaveBeenCalled();
    expect(parseStoredDraft('junk')).toBeNull();
    expect(parseStoredDraft({ ...emptyDraft(NOW), photos: 'nope' })).toBeNull();
  });

  it('Start over clears the stored draft; an empty draft is not kept', () => {
    const storage = memoryStorage();
    const store = createDraftStore(storage, { now: () => NOW });
    store.getState().update({ title: 'Lamp' });
    store.getState().flush();
    store.getState().reset();
    expect(storage.peek()).toBeUndefined();
    store.getState().update({ title: '' });
    store.getState().flush();
    expect(storage.peek()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
describe('T-UNIT-SELL-02 sell validation', () => {
  const base = {
    kind: 'sale' as const,
    title: 'Dell monitor',
    categoryId: 31,
    price: '60',
    description: '',
  };

  it('shows every problem at once, in screen order', () => {
    expect(validateDetails({ ...base, title: 'ab', categoryId: null, price: '4500' })).toEqual([
      { field: 'title', kind: 'short' },
      { field: 'category', kind: 'missing' },
      { field: 'price', kind: 'too_high' },
    ]);
    expect(validateDetails(base)).toEqual([]);
  });

  it('price bounds: $1 to $2,000', () => {
    expect(validateDetails({ ...base, price: '' })).toEqual([{ field: 'price', kind: 'missing' }]);
    expect(validateDetails({ ...base, price: '0' })).toEqual([{ field: 'price', kind: 'missing' }]);
    expect(validateDetails({ ...base, price: '0.5' })).toEqual([
      { field: 'price', kind: 'too_low' },
    ]);
    expect(validateDetails({ ...base, price: '2000' })).toEqual([]);
    expect(validateDetails({ ...base, price: '2000.01' })).toEqual([
      { field: 'price', kind: 'too_high' },
    ]);
  });

  it('give it away: no category or price needed, and the price is forced to 0', () => {
    expect(validateDetails({ ...base, kind: 'free', categoryId: null, price: '4500' })).toEqual([]);
    expect(listingPriceCents({ kind: 'free', price: '60' })).toBe(0);
    expect(listingPriceCents({ kind: 'sale', price: '60.5' })).toBe(6050);
  });

  it('cleans typed prices', () => {
    expect(cleanPrice('$1,200.505')).toBe('1200.50');
    expect(cleanPrice('007')).toBe('7');
    expect(cleanPrice('abc')).toBe('');
    expect(priceToCents('')).toBeNull();
    expect(priceToCents('12.34')).toBe(1234);
  });

  it('long description', () => {
    expect(validateDetails({ ...base, description: 'x'.repeat(1001) })).toEqual([
      { field: 'description', kind: 'long' },
    ]);
  });

  it('pickup days (DEC 54)', () => {
    const wed = new Date('2027-03-10T15:00:00');
    expect(pickupDate('tomorrow', wed)).toBe('2027-03-11');
    expect(pickupDate('sunday', wed)).toBe('2027-03-14');
    expect(pickupDate('week', wed)).toBe('2027-03-17');
    expect(pickupDate('sunday', new Date('2027-03-14T10:00:00'))).toBe('2027-03-21');
  });
});

describe('photo grid rules', () => {
  it('moves photos and clamps the target', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, 9)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });

  it('finds the cell under a dragged photo', () => {
    // 100 px cells, 8 px gap, 3 columns, 5 photos
    expect(cellAt(50, 50, 100, 8, 3, 5)).toBe(0);
    expect(cellAt(260, 50, 100, 8, 3, 5)).toBe(2);
    expect(cellAt(160, 160, 100, 8, 3, 5)).toBe(4);
    expect(cellAt(260, 160, 100, 8, 3, 5)).toBe(4);
  });

  it('step 1 is ready only when every photo is uploaded', () => {
    expect(photosState([])).toBe('empty');
    expect(photosState([photo('a'), photo('b', 'uploading')])).toBe('uploading');
    expect(photosState([photo('a'), photo('b', 'failed')])).toBe('failed');
    expect(photosState([photo('a')])).toBe('ready');
  });

  it('says how long ago', () => {
    expect(agoText(ago(new Date('2027-03-10T11:59:58'), NOW))).toBe('just now');
    expect(agoText(ago(new Date('2027-03-10T11:59:48'), NOW))).toBe('12 seconds ago');
    expect(agoText(ago(new Date('2027-03-10T11:40:00'), NOW))).toBe('20 minutes ago');
    expect(agoText(ago(new Date('2027-03-09T20:00:00'), NOW))).toBe('yesterday');
    expect(agoText(ago(new Date('2027-03-06T20:00:00'), NOW))).toBe('4 days ago');
  });

  it('labels a child category with its parent', () => {
    const cats = [
      { id: 3, name: 'Tech', parentId: null },
      { id: 31, name: 'Monitors', parentId: 3 },
    ];
    expect(categoryLabel(cats, 31)).toBe('Tech / Monitors');
    expect(categoryLabel(cats, 3)).toBe('Tech');
    expect(categoryLabel(cats, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
function fakeApi(over: Partial<Record<keyof SellApi, jest.Mock>> = {}) {
  let n = 0;
  const api = {
    reserveListingId: jest.fn(async () => 'listing-1'),
    uploadPhoto: jest.fn(
      async (_id: string, p: { uri: string }, onProgress: (f: number) => void) => {
        onProgress(1);
        n += 1;
        return {
          path: `c/x/l/listing-1/${n}_full.webp`,
          thumbPath: `c/x/l/listing-1/${n}_thumb.webp`,
          width: 1080,
          height: 810,
          blurhash: null,
          uri: p.uri,
        };
      },
    ),
    checkText: jest.fn(async (text: string) =>
      /vape/i.test(text) ? { result: 'block', term: 'vape' } : { result: 'ok', term: null },
    ),
    categories: jest.fn(async () => [
      { id: 1, name: 'Dorm & furniture', parentId: null },
      { id: 3, name: 'Tech', parentId: null },
      { id: 31, name: 'Monitors', parentId: 3 },
    ]),
    ...over,
  };
  return api as unknown as SellApi & typeof api;
}

const granted: OsApi = {
  get: async () => ({ status: 'granted', canAskAgain: true }),
  request: async () => ({ status: 'granted', canAskAgain: true }),
};
const deniedForGood: OsApi = {
  get: async () => ({ status: 'denied', canAskAgain: false }),
  request: async () => ({ status: 'denied', canAskAgain: false }),
};

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

describe('P5-SELL-02 D01 Sell · photos', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const photosRoute = (api: SellApi, store: ReturnType<typeof createDraftStore>, over = {}) => ({
    'sell/index': () => (
      <SellPhotosScreen
        api={api}
        store={store}
        pick={async () => [
          { uri: 'file:///a.jpg', width: 1200, height: 900 },
          { uri: 'file:///b.jpg', width: 900, height: 1200 },
        ]}
        cameraOs={granted}
        photosOs={granted}
        newId={(() => {
          let i = 0;
          return () => `p${++i}`;
        })()}
        mediaBase={() => 'http://media.test'}
        now={() => NOW}
        {...over}
      />
    ),
    'sell/details': () => <Stub id="screen-details-stub" />,
  });

  it('picks photos, reserves one id, uploads each, and then Next works', async () => {
    const api = fakeApi();
    const store = createDraftStore(memoryStorage(), { now: () => NOW });
    const router = setup('/sell', photosRoute(api, store));
    expect(await screen.findByText(sell.photosBody)).toBeTruthy();
    expect(screen.getByTestId('sell-photos-next')).toBeDisabled();
    tap('sell-add-library');
    await waitFor(() =>
      expect(store.getState().draft.photos.map((p) => p.status)).toEqual(['done', 'done']),
    );
    expect(api.reserveListingId).toHaveBeenCalledTimes(1);
    expect(api.uploadPhoto).toHaveBeenCalledTimes(2);
    expect(store.getState().draft.listingId).toBe('listing-1');
    expect(screen.getByText(sell.cover)).toBeTruthy();
    tap('sell-photos-next');
    await waitFor(() => expect(router.getPathname()).toBe('/sell/details'));
  });

  it('a failed upload shows Retry; retrying uploads it again', async () => {
    const api = fakeApi({ uploadPhoto: jest.fn().mockRejectedValueOnce(new Error('offline')) });
    api.uploadPhoto.mockImplementation(async () => ({
      path: 'c/x/l/listing-1/z_full.webp',
      thumbPath: 'c/x/l/listing-1/z_thumb.webp',
      width: 1,
      height: 1,
      blurhash: null,
    }));
    const store = createDraftStore(memoryStorage(), { now: () => NOW });
    setup(
      '/sell',
      photosRoute(api, store, {
        pick: async () => [{ uri: 'file:///a.jpg', width: 1, height: 1 }],
      }),
    );
    tap('sell-add-library');
    expect(await screen.findByTestId('sell-photo-retry-0')).toBeTruthy();
    expect(screen.getByText(sell.fixUploads)).toBeTruthy();
    expect(screen.getByTestId('sell-photos-next')).toBeDisabled();
    tap('sell-photo-0');
    await waitFor(() => expect(store.getState().draft.photos[0]?.status).toBe('done'));
    expect(api.uploadPhoto).toHaveBeenCalledTimes(2);
  });

  it('screen reader actions reorder and remove photos', async () => {
    const store = createDraftStore(memoryStorage(), { now: () => NOW });
    store
      .getState()
      .update({ listingId: 'listing-1', photos: [photo('a'), photo('b'), photo('c')] });
    store.getState().keep();
    setup('/sell', photosRoute(fakeApi(), store));
    const second = await screen.findByTestId('sell-photo-1');
    fireEvent(second, 'accessibilityAction', { nativeEvent: { actionName: 'cover' } });
    expect(store.getState().draft.photos.map((p) => p.id)).toEqual(['b', 'a', 'c']);
    fireEvent(screen.getByTestId('sell-photo-0'), 'accessibilityAction', {
      nativeEvent: { actionName: 'later' },
    });
    expect(store.getState().draft.photos.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    tap('sell-photo-remove-2');
    expect(store.getState().draft.photos.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('camera turned off for good: explains and links to Settings', async () => {
    const store = createDraftStore(memoryStorage(), { now: () => NOW });
    setup('/sell', photosRoute(fakeApi(), store, { cameraOs: deniedForGood }));
    await screen.findByTestId('sell-add-camera');
    await act(async () => {});
    tap('sell-add-camera');
    expect(await screen.findByText(primer.camera.deniedTitle)).toBeTruthy();
    expect(screen.getByText(primer.openSettings)).toBeTruthy();
  });

  it('a draft from before an app kill offers to pick up where it left off', async () => {
    const storage = memoryStorage({
      ...emptyDraft(new Date('2027-03-09T18:00:00')),
      title: 'Dell monitor',
      photos: [photo('a')],
    });
    const store = createDraftStore(storage, { now: () => NOW });
    setup('/sell', photosRoute(fakeApi(), store));
    expect(await screen.findByText(sell.restoreTitle)).toBeTruthy();
    expect(screen.getByText('You started listing Dell monitor yesterday.')).toBeTruthy();
    tap('sell-restore-start-over');
    expect(store.getState().draft.photos).toEqual([]);
    expect(storage.peek()).toBeUndefined();
  });
});

describe('P5-SELL-03 D02 Sell · details', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const detailsRoute = (api: SellApi, store: ReturnType<typeof createDraftStore>) => ({
    'sell/details': () => <SellDetailsScreen api={api} store={store} />,
    'sell/meetup': () => <Stub id="screen-meetup-stub" />,
  });

  it('D3: every error shows at once, Next stays off until they are fixed', async () => {
    const api = fakeApi();
    const store = createDraftStore(memoryStorage(), { now: () => NOW });
    const router = setup('/sell/details', detailsRoute(api, store));
    fireEvent.changeText(await screen.findByTestId('sell-title'), 'Vape + charger bundle');
    fireEvent.changeText(screen.getByTestId('sell-price'), '$4,500');
    tap('sell-details-next');
    expect(await screen.findByText('3 things to fix before you can post')).toBeTruthy();
    expect(
      screen.getByText('"vape" isn\'t allowed on OnlySwap. Check the banned items in the rules.'),
    ).toBeTruthy();
    expect(screen.getByText(sell.errors.category)).toBeTruthy();
    expect(screen.getByText(sell.errors.priceHigh)).toBeTruthy();
    expect(screen.getByTestId('sell-details-next')).toBeDisabled();

    fireEvent.changeText(screen.getByTestId('sell-title'), 'Dell 24" monitor');
    fireEvent.changeText(screen.getByTestId('sell-price'), '60');
    tap('sell-category');
    tap('sell-category-31');
    await waitFor(() => expect(screen.queryByTestId('sell-details-fix-banner')).toBeNull());
    expect(store.getState().draft.categoryId).toBe(31);
    expect(screen.getByText('Tech / Monitors')).toBeTruthy();
    tap('sell-details-next');
    await waitFor(() => expect(router.getPathname()).toBe('/sell/meetup'));
  });

  it('D4: give it away hides category and price and asks for a pickup day', async () => {
    const store = createDraftStore(memoryStorage(), { now: () => NOW });
    setup('/sell/details', detailsRoute(fakeApi(), store));
    fireEvent.press(await screen.findByLabelText(sell.giveAway));
    expect(screen.queryByTestId('sell-price')).toBeNull();
    expect(screen.queryByTestId('sell-category')).toBeNull();
    expect(screen.getByText(sell.freeTitle)).toBeTruthy();
    fireEvent.press(screen.getByLabelText(sell.pickup.tomorrow));
    expect(store.getState().draft.pickupBy).toBe('tomorrow');
    expect(store.getState().draft.kind).toBe('free');
  });

  it('when the text check fails offline, it says so and stays on the step', async () => {
    const api = fakeApi({
      checkText: jest.fn().mockRejectedValue(new TypeError('Network request failed')),
    });
    const store = createDraftStore(memoryStorage(), { now: () => NOW });
    const router = setup('/sell/details', detailsRoute(api, store));
    fireEvent.changeText(await screen.findByTestId('sell-title'), 'Desk lamp');
    tap('sell-details-next');
    expect(await screen.findByText(sell.errors.checkFailed)).toBeTruthy();
    expect(router.getPathname()).toBe('/sell/details');
  });
});
