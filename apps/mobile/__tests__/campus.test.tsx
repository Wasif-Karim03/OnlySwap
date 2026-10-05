import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Text } from 'react-native';

import { useToastStore } from '../src/components/Toast';
import type { CampusApi } from '../src/features/campus/api';
import { CampusFeedScreen } from '../src/features/campus/CampusFeedScreen';
import {
  budgetCents,
  budgetLabel,
  canAnswer,
  countdown,
  countdownLabel,
  dayOneBody,
  foodArgs,
  foodMinutesLabel,
  FOOD_MINUTES,
  foundingState,
  isGone,
  isUrgent,
  mergeCampusPages,
  postErrorText,
  tickMs,
  validateFood,
  validateWanted,
  wantedArgs,
  type CampusItem,
  type CampusPage,
  type FoodForm,
  type WantedForm,
} from '../src/features/campus/logic';
import { PostFoodScreen } from '../src/features/campus/PostFoodScreen';
import { PostWantedScreen } from '../src/features/campus/PostWantedScreen';
import type { FeedApi } from '../src/features/feed/api';
import { ListingScreen } from '../src/features/feed/ListingScreen';
import type { ListingResult } from '../src/features/feed/logic';
import { NotificationSettingsScreen } from '../src/features/notifications/NotificationSettingsScreen';
import type { NotificationPrefs, NotificationsApi } from '../src/features/notifications/api';
import type { PostedListing, SellApi } from '../src/features/sell/api';
import { answerWanted, createDraftStore } from '../src/features/sell/draft';
import {
  createArgs,
  emptyDraft,
  parseStoredDraft,
  type SellDraft,
  type Spot,
} from '../src/features/sell/logic';
import { SellPhotosScreen } from '../src/features/sell/SellPhotosScreen';
import { routeForNotification } from '../src/lib/push';
import { campus, notificationsScreen, states } from '../src/strings/en';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const NOW = new Date('2026-10-04T12:00:00Z');
const at = (mins: number) => new Date(NOW.getTime() + mins * 60_000).toISOString();

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
    bumped_at: at(-30),
    created_at: at(-30),
    expires_at: null,
    is_own: false,
    saved: false,
    watching: false,
    seller: {
      id: 's1',
      display_name: 'Chris A.',
      avatar_path: null,
      year: null,
      created_at: null,
    },
    photos: [],
    wanted_max_cents: null,
    wanted_ref: null,
    place: null,
    ...over,
  };
}

function page(items: CampusItem[], over: Partial<CampusPage> = {}): CampusPage {
  return {
    items,
    next_cursor: null,
    day_one: false,
    active_listings: 40,
    founding: { limit: 50, left: 0, mine: false },
    ...over,
  };
}

function memoryStorage() {
  let value: unknown;
  return {
    get: () => value,
    set: (v: SellDraft) => {
      value = JSON.parse(JSON.stringify(v));
    },
    remove: () => {
      value = undefined;
    },
  };
}

const newStore = () => createDraftStore(memoryStorage(), { now: () => NOW, saveMs: 0 });

function Stub({ id }: { id: string }) {
  return <Text testID={id}>{id}</Text>;
}

function renderAt(routes: Record<string, () => ReactNode>, initialUrl: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderRouter(
    {
      index: () => <Stub id="screen-index" />,
      sell: () => <Stub id="screen-sell" />,
      ...routes,
    },
    { initialUrl, wrapper },
  );
}

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});
afterEach(() => {
  jest.restoreAllMocks();
  act(() => useToastStore.getState().dismiss());
});

// ---------------------------------------------------------------------------------------------
describe('P6-CAMP-01 free food countdown', () => {
  it('counts down in minutes, then hours and minutes', () => {
    expect(countdown(null, NOW)).toBeNull();
    expect(countdown('not a date', NOW)).toBeNull();
    expect(countdown(at(80), NOW)).toEqual({ kind: 'hours', h: 1, m: 20 });
    expect(countdown(at(120), NOW)).toEqual({ kind: 'hours', h: 2, m: 0 });
    expect(countdown(at(59.9), NOW)).toEqual({ kind: 'minutes', m: 59 });
    expect(countdown(at(0.5), NOW)).toEqual({ kind: 'under_minute' });
    expect(countdownLabel({ kind: 'hours', h: 1, m: 20 })).toBe('1 h 20 min left');
    expect(countdownLabel({ kind: 'hours', h: 2, m: 0 })).toBe('2 h left');
    expect(countdownLabel({ kind: 'minutes', m: 12 })).toBe('12 min left');
    expect(countdownLabel({ kind: 'under_minute' })).toBe(campus.underMinute);
  });

  it('is gone at zero and after', () => {
    expect(countdown(at(0), NOW)).toEqual({ kind: 'gone' });
    expect(countdown(at(-5), NOW)).toEqual({ kind: 'gone' });
    expect(countdownLabel({ kind: 'gone' })).toBe(campus.gone);
    expect(isGone(campusItem('f', { kind: 'food', expires_at: at(-1) }), NOW)).toBe(true);
    expect(isGone(campusItem('f', { kind: 'food', expires_at: at(10) }), NOW)).toBe(false);
    // Only food is "gone" by the clock; other posts expire on the server.
    expect(isGone(campusItem('s', { expires_at: at(-1) }), NOW)).toBe(false);
  });

  it('turns urgent under 15 minutes and ticks faster in the last minute', () => {
    expect(isUrgent(countdown(at(14), NOW))).toBe(true);
    expect(isUrgent(countdown(at(16), NOW))).toBe(false);
    expect(isUrgent(countdown(at(0.4), NOW))).toBe(true);
    expect(isUrgent(null)).toBe(false);
    expect(tickMs({ kind: 'under_minute' })).toBe(1000);
    expect(tickMs({ kind: 'minutes', m: 5 })).toBe(15_000);
  });
});

describe('P6-CAMP-01 feed rules', () => {
  it('merges pages without repeats', () => {
    const a = campusItem('a');
    const b = campusItem('b');
    expect(mergeCampusPages([page([a, b]), page([b, campusItem('c')])]).map((i) => i.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('"I have this" only on other people\'s open Wanted posts', () => {
    expect(canAnswer({ kind: 'wanted', is_own: false, status: 'active' })).toBe(true);
    expect(canAnswer({ kind: 'wanted', is_own: true, status: 'active' })).toBe(false);
    expect(canAnswer({ kind: 'wanted', is_own: false, status: 'sold' })).toBe(false);
    expect(canAnswer({ kind: 'sale', is_own: false, status: 'active' })).toBe(false);
  });

  it('budget, founding sellers and day one copy', () => {
    expect(budgetLabel(4000)).toBe('Up to $40');
    expect(budgetLabel(1250)).toBe('Up to $12.50');
    expect(budgetLabel(null)).toBe(campus.anyBudget);
    expect(foundingState({ limit: 50, left: 16, mine: false })).toBe('open');
    expect(foundingState({ limit: 50, left: 0, mine: true })).toBe('mine');
    expect(foundingState({ limit: 50, left: 0, mine: false })).toBeNull();
    expect(foundingState({ limit: 0, left: 0, mine: false })).toBeNull();
    expect(foundingState(null)).toBeNull();
    expect(dayOneBody(11)).toContain('11 listings');
    expect(dayOneBody(1)).toBe(campus.dayOneBodyOne);
    expect(dayOneBody(0)).toBe(campus.dayOneBodyNone);
  });
});

// ---------------------------------------------------------------------------------------------
describe('P5-SELL-06 food and Wanted forms', () => {
  const food = (over: Partial<FoodForm> = {}): FoodForm => ({
    title: 'Leftover pizza',
    spotId: 'spot-1',
    place: '',
    minutes: 60,
    photo: null,
    ...over,
  });

  it('food: every problem at once, and a place is required', () => {
    expect(validateFood(food())).toEqual([]);
    expect(validateFood(food({ title: 'ok', spotId: null }))).toEqual([
      { field: 'title', kind: 'short' },
      { field: 'place', kind: 'missing' },
    ]);
    expect(validateFood(food({ spotId: null, place: 'Dreese Lab, 2nd floor' }))).toEqual([]);
    expect(validateFood(food({ spotId: null, place: 'x'.repeat(61) }))).toEqual([
      { field: 'place', kind: 'long' },
    ]);
    expect(validateFood(food({ minutes: 10 }))).toEqual([{ field: 'minutes', kind: 'range' }]);
    expect(validateFood(food({ minutes: 181 }))).toEqual([{ field: 'minutes', kind: 'range' }]);
    expect(FOOD_MINUTES.map(foodMinutesLabel)).toEqual(['30 min', '1 hour', '2 hours', '3 hours']);
  });

  it('food: create_listing arguments', () => {
    const photo = { path: 'p/full', thumbPath: 'p/thumb', width: 10, height: 8, blurhash: null };
    expect(foodArgs('L9', food({ minutes: 120, photo }))).toEqual({
      id: 'L9',
      kind: 'food',
      title: 'Leftover pizza',
      description: null,
      category_id: null,
      condition: null,
      price_cents: 0,
      open_to_offers: false,
      photos: [{ path: 'p/full', thumb_path: 'p/thumb', width: 10, height: 8, blurhash: null }],
      meet_spot_ids: ['spot-1'],
      meet_note: null,
      availability: [],
      pickup_by: null,
      food_minutes: 120,
    });
    expect(foodArgs('L9', food({ spotId: null, place: ' Union ' }))).toMatchObject({
      meet_spot_ids: [],
      meet_note: 'Union',
      photos: [],
    });
  });

  const wanted = (over: Partial<WantedForm> = {}): WantedForm => ({
    title: 'TI-84 Plus',
    budget: '40',
    categoryId: 2,
    description: '',
    photo: null,
    ...over,
  });

  it('Wanted: optional budget up to $2,000', () => {
    expect(validateWanted(wanted())).toEqual([]);
    expect(validateWanted(wanted({ budget: '' }))).toEqual([]);
    expect(validateWanted(wanted({ budget: '2000.01' }))).toEqual([
      { field: 'budget', kind: 'high' },
    ]);
    expect(validateWanted(wanted({ title: '', description: 'x'.repeat(1001) }))).toEqual([
      { field: 'title', kind: 'short' },
      { field: 'description', kind: 'long' },
    ]);
    expect(budgetCents('')).toBeNull();
    expect(budgetCents('12.5')).toBe(1250);
  });

  it('Wanted: create_listing arguments', () => {
    expect(wantedArgs('W1', wanted({ description: ' 84 or 84 CE ' }))).toEqual({
      id: 'W1',
      kind: 'wanted',
      title: 'TI-84 Plus',
      description: '84 or 84 CE',
      category_id: 2,
      condition: null,
      price_cents: 0,
      open_to_offers: false,
      photos: [],
      meet_spot_ids: [],
      meet_note: null,
      availability: [],
      pickup_by: null,
      wanted_max_cents: 4000,
    });
    expect(wantedArgs('W1', wanted({ budget: '' })).wanted_max_cents).toBeNull();
  });

  it('caps and banned words get friendly copy', () => {
    expect(postErrorText({ code: 'RATE_LIMITED', action: 'create_food' })).toBe(
      campus.errors.foodCap,
    );
    expect(postErrorText({ code: 'RATE_LIMITED', action: 'create_wanted' })).toBe(
      campus.errors.wantedCap,
    );
    expect(postErrorText({ code: 'RATE_LIMITED', action: 'create_listing_new' })).toBe(
      campus.errors.newAccountCap,
    );
    expect(postErrorText({ code: 'RATE_LIMITED', action: 'create_listing' })).toBe(
      campus.errors.dailyCap,
    );
    expect(postErrorText({ code: 'RATE_LIMITED', action: 'other' })).toBeNull();
    expect(postErrorText({ code: 'BANNED_TERM', detail: 'vape' })).toBe(
      '"vape" isn\'t allowed on OnlySwap.',
    );
    expect(postErrorText({ code: 'ERR_OFFLINE' })).toBe(campus.errors.postFailed);
    expect(postErrorText({ code: 'INVALID' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
describe('P5-SELL-08 "I have this" carries wanted_ref', () => {
  it('prefills a fresh draft and reset clears it', () => {
    const store = newStore();
    store.getState().update({ title: 'Old lamp', price: '5' });
    answerWanted(store, { id: 'W1', title: 'TI-84 Plus', category_id: 4 });
    const d = store.getState().draft;
    expect(d).toMatchObject({
      kind: 'sale',
      title: 'TI-84 Plus',
      categoryId: 4,
      price: '',
      wantedRef: 'W1',
      wantedTitle: 'TI-84 Plus',
    });
    store.getState().reset();
    expect(store.getState().draft.wantedRef).toBeNull();
    expect(store.getState().draft.wantedTitle).toBeNull();
  });

  it('create_listing sends wanted_ref only when set', () => {
    const base = {
      ...emptyDraft(NOW),
      listingId: 'L1',
      title: 'TI-84',
      categoryId: 4,
      price: '30',
    };
    expect(createArgs({ ...base, wantedRef: 'W1' }, [])).toMatchObject({ wanted_ref: 'W1' });
    expect(createArgs(base, [])).not.toHaveProperty('wanted_ref');
  });

  it('a stored draft keeps wanted_ref; older drafts read as none', () => {
    const stored = { ...emptyDraft(NOW), title: 'TI-84', wantedRef: 'W1', wantedTitle: 'TI-84' };
    expect(parseStoredDraft(stored, NOW)?.wantedRef).toBe('W1');
    const old: Record<string, unknown> = { ...emptyDraft(NOW), title: 'Lamp' };
    delete old.wantedRef;
    delete old.wantedTitle;
    expect(parseStoredDraft(old, NOW)?.wantedRef).toBeNull();
  });

  it('Sell step 1 shows the Wanted it answers and can drop it', async () => {
    const store = newStore();
    answerWanted(store, { id: 'W1', title: 'TI-84 Plus', category_id: 4 });
    const os = {
      get: jest.fn(async () => ({ status: 'granted' as const, canAskAgain: true })),
      request: jest.fn(async () => ({ status: 'granted' as const, canAskAgain: true })),
    };
    renderAt(
      {
        sell: () => (
          <SellPhotosScreen
            store={store}
            cameraOs={os}
            photosOs={os}
            api={{} as SellApi}
            now={() => NOW}
          />
        ),
      },
      '/sell',
    );
    expect(await screen.findByTestId('sell-answering')).toBeTruthy();
    expect(screen.getByText(/TI-84 Plus\. When you post/)).toBeTruthy();
    expect(screen.queryByTestId('sell-campus-entries')).toBeNull();
    fireEvent.press(screen.getByTestId('sell-answering-remove'));
    await waitFor(() => expect(store.getState().draft.wantedRef).toBeNull());
    expect(screen.queryByTestId('sell-answering')).toBeNull();
    // Without a Wanted, step 1 offers the Around campus posts.
    expect(screen.getByTestId('sell-campus-entries')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------
describe('C01 Around campus', () => {
  const FOOD = campusItem('food1', {
    kind: 'food',
    title: 'Leftover pizza',
    price_cents: 0,
    expires_at: at(80),
    place: 'Dreese Lab',
  });
  const GONE = campusItem('food2', { kind: 'food', title: 'Bagels', expires_at: at(-1) });
  const WANT = campusItem('want1', {
    kind: 'wanted',
    title: 'TI-84 Plus',
    price_cents: 0,
    category_id: 4,
    wanted_max_cents: 4000,
  });
  const MINE = campusItem('want2', { kind: 'wanted', title: 'Bike lock', is_own: true });
  const FREE = campusItem('free1', { kind: 'free', title: 'Floor mirror', price_cents: 0 });

  function fakeCampus(over: Partial<CampusApi> = {}): CampusApi {
    return { feed: jest.fn(async () => page([FOOD, GONE, WANT, MINE, FREE])), ...over };
  }

  const open = (api: CampusApi, store = newStore()) =>
    renderAt(
      {
        'discover/campus': () => (
          <CampusFeedScreen api={api} store={store} now={() => NOW} mediaBase={() => 'http://m'} />
        ),
        'listing/[id]': () => <Stub id="screen-listing" />,
        'sell/food': () => <Stub id="screen-food" />,
        'sell/wanted': () => <Stub id="screen-wanted" />,
        discover: () => <Stub id="screen-discover" />,
      },
      '/discover/campus',
    );

  it('shows food with a live countdown, gone food, Wanted and free stuff', async () => {
    const api = fakeCampus();
    open(api);
    expect(await screen.findByTestId('campus-item-food1')).toBeTruthy();
    expect(api.feed).toHaveBeenCalledWith('all', null);
    expect(screen.getByText('1 h 20 min left')).toBeTruthy();
    expect(screen.getByText('Dreese Lab')).toBeTruthy();
    expect(screen.getByText(campus.gone)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Free food: Bagels/ }).props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(screen.getByText('Up to $40')).toBeTruthy();
    expect(screen.getByTestId('campus-item-want1-answer')).toBeTruthy();
    // Your own Wanted: no "I have this".
    expect(screen.queryByTestId('campus-item-want2-answer')).toBeNull();
    expect(screen.getByText(campus.yours)).toBeTruthy();
    expect(screen.getByText('Floor mirror')).toBeTruthy();
  });

  it('opens a post', async () => {
    open(fakeCampus());
    fireEvent.press(await screen.findByRole('button', { name: /Free food: Leftover pizza/ }));
    expect(await screen.findByTestId('screen-listing')).toBeTruthy();
  });

  it('filter chips load that kind; empty per filter', async () => {
    const feed = jest.fn(async (kind: string) => (kind === 'wanted' ? page([]) : page([FOOD])));
    open(fakeCampus({ feed }));
    await screen.findByTestId('campus-item-food1');
    fireEvent.press(screen.getByRole('checkbox', { name: campus.filters.wanted }));
    await waitFor(() => expect(feed).toHaveBeenCalledWith('wanted', null));
    expect(await screen.findByTestId('campus-empty-wanted')).toBeTruthy();
    expect(screen.getByText(campus.empty.wanted.title)).toBeTruthy();
  });

  it('"I have this" opens Sell prefilled with wanted_ref', async () => {
    const store = newStore();
    open(fakeCampus(), store);
    fireEvent.press(await screen.findByTestId('campus-item-want1-answer'));
    expect(await screen.findByTestId('screen-sell')).toBeTruthy();
    expect(store.getState().draft).toMatchObject({
      title: 'TI-84 Plus',
      categoryId: 4,
      wantedRef: 'want1',
    });
  });

  it('day one hero and founding sellers', async () => {
    open(
      fakeCampus({
        feed: jest.fn(async () =>
          page([FREE], {
            day_one: true,
            active_listings: 3,
            founding: { limit: 50, left: 34, mine: false },
          }),
        ),
      }),
    );
    expect(await screen.findByTestId('campus-day-one')).toBeTruthy();
    expect(screen.getByText(/3 listings so far/)).toBeTruthy();
    expect(screen.getByTestId('campus-founding-open')).toBeTruthy();
    expect(screen.getByText(/34 of 50 spots left/)).toBeTruthy();
  });

  it('founding seller: your badge instead of the open spots', async () => {
    open(
      fakeCampus({
        feed: jest.fn(async () => page([FREE], { founding: { limit: 50, left: 0, mine: true } })),
      }),
    );
    expect(await screen.findByTestId('campus-founding-mine')).toBeTruthy();
    expect(screen.queryByTestId('campus-day-one')).toBeNull();
  });

  it('error with retry, offline copy', async () => {
    const feed = jest
      .fn()
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValue(page([FOOD]));
    open(fakeCampus({ feed }));
    expect(await screen.findByTestId('campus-error')).toBeTruthy();
    expect(screen.getByText(states.offlineTitle)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByTestId('campus-item-food1')).toBeTruthy();
  });

  it('loads the next page at the end of the list', async () => {
    const feed = jest
      .fn()
      .mockResolvedValueOnce(page([FOOD], { next_cursor: { bumped_at: at(-30), id: 'food1' } }))
      .mockResolvedValueOnce(page([FREE]));
    open(fakeCampus({ feed }));
    await screen.findByTestId('campus-item-food1');
    fireEvent(screen.getByTestId('campus-feed'), 'onEndReached');
    await waitFor(() =>
      expect(feed).toHaveBeenLastCalledWith('all', { bumped_at: at(-30), id: 'food1' }),
    );
    expect(await screen.findByTestId('campus-item-free1')).toBeTruthy();
  });

  it('the post buttons open the forms', async () => {
    open(fakeCampus());
    fireEvent.press(await screen.findByTestId('campus-post-food'));
    expect(await screen.findByTestId('screen-food')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------
const SPOTS: Spot[] = [
  {
    id: 'spot-1',
    name: 'Ohio Union',
    description: null,
    hours: null,
    lat: 40,
    lng: -83,
    police: false,
    isDefault: true,
    sort: 1,
  },
];

function posted(over: Partial<PostedListing> = {}): PostedListing {
  return {
    id: 'L9',
    status: 'active',
    kind: 'food',
    title: 'Leftover pizza',
    price_cents: 0,
    condition: null,
    photos: [],
    ...over,
  };
}

function fakeSell(over: Partial<SellApi> = {}) {
  return {
    reserveListingId: jest.fn(async () => 'L9'),
    uploadPhoto: jest.fn(async () => ({
      path: 'c/l/L9/full.webp',
      thumbPath: 'c/l/L9/thumb.webp',
      width: 100,
      height: 80,
      blurhash: null,
    })),
    createListing: jest.fn(async () => posted()),
    spots: jest.fn(async () => SPOTS),
    categories: jest.fn(async () => [
      { id: 2, name: 'Textbooks', parentId: null },
      { id: 4, name: 'Tech', parentId: null },
      { id: 41, name: 'Calculators', parentId: 4 },
    ]),
    ...over,
  } as unknown as SellApi;
}

const granted = {
  get: jest.fn(async () => ({ status: 'granted' as const, canAskAgain: true })),
  request: jest.fn(async () => ({ status: 'granted' as const, canAskAgain: true })),
};

describe('C02 Post free food', () => {
  const food = (api: SellApi, extra: Partial<Parameters<typeof PostFoodScreen>[0]> = {}) =>
    renderAt(
      {
        'sell/food': () => (
          <PostFoodScreen api={api} photosOs={granted} mediaBase={() => 'http://m'} {...extra} />
        ),
        'discover/campus': () => <Stub id="screen-campus" />,
      },
      '/sell/food',
    );

  it('shows every problem and posts nothing', async () => {
    const api = fakeSell();
    food(api);
    await screen.findByTestId('food-spots');
    fireEvent.press(screen.getByTestId('food-post'));
    expect(await screen.findByTestId('food-fix')).toBeTruthy();
    expect(screen.getByText(campus.errors.titleShort)).toBeTruthy();
    expect(screen.getByTestId('food-place-error')).toBeTruthy();
    expect(api.createListing).not.toHaveBeenCalled();
    expect(api.reserveListingId).not.toHaveBeenCalled();
  });

  it('posts kind food on a reserved id and shows success', async () => {
    const api = fakeSell();
    food(api);
    fireEvent.changeText(await screen.findByTestId('food-title'), 'Leftover pizza');
    fireEvent.press(await screen.findByRole('checkbox', { name: 'Ohio Union' }));
    fireEvent.press(screen.getByRole('checkbox', { name: '2 hours' }));
    fireEvent.press(screen.getByTestId('food-post'));
    expect(await screen.findByTestId('food-posted')).toBeTruthy();
    expect(api.createListing).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'L9',
        kind: 'food',
        title: 'Leftover pizza',
        meet_spot_ids: ['spot-1'],
        food_minutes: 120,
      }),
    );
    expect(screen.getByText(campus.foodPostedTitle)).toBeTruthy();
    fireEvent.press(screen.getByTestId('food-posted-see'));
    expect(await screen.findByTestId('screen-campus')).toBeTruthy();
  });

  it('somewhere else: a typed place', async () => {
    const api = fakeSell();
    food(api);
    fireEvent.changeText(await screen.findByTestId('food-title'), 'Bagels');
    fireEvent.press(await screen.findByRole('checkbox', { name: campus.foodOther }));
    fireEvent.changeText(screen.getByTestId('food-place'), 'Dreese Lab lounge');
    fireEvent.press(screen.getByTestId('food-post'));
    await waitFor(() =>
      expect(api.createListing).toHaveBeenCalledWith(
        expect.objectContaining({
          meet_spot_ids: [],
          meet_note: 'Dreese Lab lounge',
          food_minutes: 60,
        }),
      ),
    );
  });

  it('the daily cap gets its own message', async () => {
    const api = fakeSell({
      createListing: jest.fn(async () => {
        throw { code: 'P0001', message: 'RATE_LIMITED:create_food:2026-10-05T04:00:00Z' };
      }),
    });
    food(api);
    fireEvent.changeText(await screen.findByTestId('food-title'), 'Leftover pizza');
    fireEvent.press(await screen.findByRole('checkbox', { name: 'Ohio Union' }));
    fireEvent.press(screen.getByTestId('food-post'));
    expect(await screen.findByText(campus.errors.foodCap)).toBeTruthy();
    expect(screen.queryByTestId('food-posted')).toBeNull();
  });

  it('a photo uploads under the reserved id and goes with the post', async () => {
    const api = fakeSell();
    food(api, { pick: async () => [{ uri: 'file://p.jpg', width: 100, height: 80 }] });
    fireEvent.changeText(await screen.findByTestId('food-title'), 'Leftover pizza');
    fireEvent.press(await screen.findByRole('checkbox', { name: 'Ohio Union' }));
    fireEvent.press(screen.getByTestId('food-add-photo'));
    await waitFor(() => expect(api.uploadPhoto).toHaveBeenCalled());
    expect((api.uploadPhoto as jest.Mock).mock.calls[0][0]).toBe('L9');
    await waitFor(() => expect(screen.getByText(campus.changePhoto)).toBeTruthy());
    fireEvent.press(screen.getByTestId('food-post'));
    await waitFor(() =>
      expect(api.createListing).toHaveBeenCalledWith(
        expect.objectContaining({
          photos: [
            {
              path: 'c/l/L9/full.webp',
              thumb_path: 'c/l/L9/thumb.webp',
              width: 100,
              height: 80,
              blurhash: null,
            },
          ],
        }),
      ),
    );
    expect(api.reserveListingId).toHaveBeenCalledTimes(1);
  });

  it('photo access off: a Settings banner', async () => {
    const denied = {
      get: jest.fn(async () => ({ status: 'denied' as const, canAskAgain: false })),
      request: jest.fn(),
    };
    const openSettings = jest.fn(async () => {});
    food(fakeSell(), { photosOs: denied, openSettings });
    fireEvent.press(await screen.findByTestId('food-add-photo'));
    expect(await screen.findByTestId('food-photos-off')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: campus.openSettings }));
    expect(openSettings).toHaveBeenCalled();
  });
});

describe('C03 Post a Wanted', () => {
  const wanted = (api: SellApi) =>
    renderAt(
      {
        'sell/wanted': () => (
          <PostWantedScreen api={api} photosOs={granted} mediaBase={() => 'http://m'} />
        ),
      },
      '/sell/wanted',
    );

  it('validates the budget', async () => {
    const api = fakeSell();
    wanted(api);
    fireEvent.changeText(await screen.findByTestId('wanted-title'), 'TI-84 Plus');
    fireEvent.changeText(screen.getByTestId('wanted-budget'), '2500');
    fireEvent.press(screen.getByTestId('wanted-post'));
    expect(await screen.findByText(campus.errors.budgetHigh)).toBeTruthy();
    expect(api.createListing).not.toHaveBeenCalled();
  });

  it('posts kind wanted with the budget and a top-level category', async () => {
    const api = fakeSell({ createListing: jest.fn(async () => posted({ kind: 'wanted' })) });
    wanted(api);
    fireEvent.changeText(await screen.findByTestId('wanted-title'), 'TI-84 Plus');
    fireEvent.changeText(screen.getByTestId('wanted-budget'), '$40');
    expect(await screen.findByRole('checkbox', { name: 'Tech' })).toBeTruthy();
    // Sub-categories stay out of the chips.
    expect(screen.queryByRole('checkbox', { name: 'Calculators' })).toBeNull();
    fireEvent.press(screen.getByRole('checkbox', { name: 'Tech' }));
    fireEvent.press(screen.getByTestId('wanted-post'));
    expect(await screen.findByTestId('wanted-posted')).toBeTruthy();
    expect(api.createListing).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'L9',
        kind: 'wanted',
        title: 'TI-84 Plus',
        category_id: 4,
        wanted_max_cents: 4000,
      }),
    );
  });

  it('5 a day: the cap message; held posts say so', async () => {
    const createListing = jest
      .fn()
      .mockRejectedValueOnce({ code: 'P0001', message: 'RATE_LIMITED:create_wanted' })
      .mockResolvedValueOnce(posted({ kind: 'wanted', status: 'held_review' }));
    const api = fakeSell({ createListing });
    wanted(api);
    fireEvent.changeText(await screen.findByTestId('wanted-title'), 'TI-84 Plus');
    fireEvent.press(screen.getByTestId('wanted-post'));
    expect(await screen.findByText(campus.errors.wantedCap)).toBeTruthy();
    // Past the 500 ms double-tap guard.
    act(() => jest.advanceTimersByTime(600));
    fireEvent.press(screen.getByTestId('wanted-post'));
    expect(await screen.findByText(campus.reviewTitle)).toBeTruthy();
    // The retry reused the reserved id.
    expect(api.reserveListingId).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe('B02 Listing for food and Wanted posts', () => {
  function feedApi(result: ListingResult): FeedApi {
    return {
      getFeed: jest.fn(async () => []),
      recordSwipes: jest.fn(async () => {}),
      undoSwipe: jest.fn(async () => {}),
      save: jest.fn(async () => 1),
      unsave: jest.fn(async () => 0),
      hide: jest.fn(async () => {}),
      watch: jest.fn(async () => {}),
      recordView: jest.fn(async () => {}),
      getListing: jest.fn(async () => result),
      reportListing: jest.fn(async () => {}),
    };
  }
  const show = (result: ListingResult, store = newStore()) =>
    renderAt(
      {
        'listing/[id]/index': () => (
          <ListingScreen
            id="L1"
            api={feedApi(result)}
            spots={async () => []}
            mediaBase={() => 'http://m'}
            site={() => 'https://site'}
            share={jest.fn(async () => {})}
            now={() => NOW}
            draftStore={store}
          />
        ),
        'listing/[id]/offer': () => <Stub id="screen-offer" />,
      },
      '/listing/L1',
    );

  it('Wanted: "I have this" instead of an offer', async () => {
    const store = newStore();
    show(
      {
        ...campusItem('L1', { kind: 'wanted', title: 'TI-84 Plus', category_id: 4 }),
        access: 'buyer',
      } as ListingResult,
      store,
    );
    expect(await screen.findByText(campus.listingWanted)).toBeTruthy();
    expect(screen.queryByTestId('listing-offer')).toBeNull();
    fireEvent.press(screen.getByTestId('listing-i-have-this'));
    expect(await screen.findByTestId('screen-sell')).toBeTruthy();
    expect(store.getState().draft.wantedRef).toBe('L1');
  });

  it('food: a countdown and no offer button', async () => {
    show({
      ...campusItem('L1', { kind: 'food', title: 'Pizza', expires_at: at(20) }),
      access: 'buyer',
    } as ListingResult);
    expect(await screen.findByText('20 min left')).toBeTruthy();
    expect(screen.getByText(campus.listingFoodBody)).toBeTruthy();
    expect(screen.queryByTestId('listing-offer')).toBeNull();
    expect(screen.queryByTestId('listing-i-have-this')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
describe('R11-NOTIF-01 Around campus notifications', () => {
  it.each([
    [
      { type: 'wanted_match', listing_id: 'L2', wanted_id: 'W1' },
      { pathname: '/listing/[id]', params: { id: 'L2' } },
    ],
    [
      { type: 'wanted_match', wanted_id: 'W1' },
      { pathname: '/listing/[id]', params: { id: 'W1' } },
    ],
    [
      { type: 'free_food', listing_id: 'F1', url: '/listing/F1' },
      { pathname: '/listing/[id]', params: { id: 'F1' } },
    ],
    [{ type: 'free_food' }, { pathname: '/discover/campus', params: { kind: 'food' } }],
    [{ type: 'campus_unlocked', url: '/unlocked', campus_id: 'c1' }, '/unlocked'],
  ])('%o', (data, href) => {
    expect(routeForNotification(data)).toEqual(href);
  });

  it('settings: "Free food nearby" toggles the free_food pref', async () => {
    const prefs: NotificationPrefs = {
      offers: true,
      messages: true,
      meetups: true,
      saved_search: true,
      price_drop: true,
      tips: false,
      message_previews: false,
      free_food: false,
      quiet_start: '23:00',
      quiet_end: '08:00',
    };
    const api = {
      prefs: jest.fn(async () => prefs),
      updatePrefs: jest.fn(async (patch: Partial<NotificationPrefs>) => ({ ...prefs, ...patch })),
    } as unknown as NotificationsApi;
    const os = {
      get: jest.fn(async () => ({ status: 'granted' as const, canAskAgain: true })),
      request: jest.fn(),
    };
    renderAt(
      {
        'settings/notifications': () => (
          <NotificationSettingsScreen
            api={api}
            os={os}
            quad={{ status: async () => ({ enabled: false, rules_accepted: false }) }}
          />
        ),
      },
      '/settings/notifications',
    );
    const toggle = await screen.findByRole('switch', { name: notificationsScreen.freeFood });
    expect(toggle.props.accessibilityState).toMatchObject({ checked: false });
    fireEvent.press(toggle);
    await waitFor(() => expect(api.updatePrefs).toHaveBeenCalledWith({ free_food: true }));
  });
});
