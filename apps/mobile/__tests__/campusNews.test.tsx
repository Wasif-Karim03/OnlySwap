// DEC 98 Feed tab and campus news posts: news form rules, the social-style
// post card (Save, Make offer, Open link, Share), Post news and the news
// listing screen.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Text } from 'react-native';

import { useToastStore } from '../src/components/Toast';
import type { CampusApi, NewsApi } from '../src/features/campus/api';
import { CampusFeedScreen } from '../src/features/campus/CampusFeedScreen';
import {
  combineDayTime,
  eventLabel,
  isValidLink,
  linkHost,
  newsArgs,
  normalizeLink,
  postErrorText,
  validateNews,
  type CampusItem,
  type CampusPage,
  type NewsForm,
} from '../src/features/campus/logic';
import { PostNewsScreen } from '../src/features/campus/PostNewsScreen';
import type { FeedApi } from '../src/features/feed/api';
import { ListingScreen } from '../src/features/feed/ListingScreen';
import type { ListingResult } from '../src/features/feed/logic';
import type { Me } from '../src/features/me/api';
import type { PostedListing, SellApi } from '../src/features/sell/api';
import { campus } from '../src/strings/en';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const NOW = new Date('2026-10-04T12:00:00Z');
const at = (mins: number) => new Date(NOW.getTime() + mins * 60_000).toISOString();

function item(id: string, over: Partial<CampusItem> = {}): CampusItem {
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
    seller: { id: 's1', display_name: 'Chris A.', avatar_path: null, year: null, created_at: null },
    photos: [],
    wanted_max_cents: null,
    wanted_ref: null,
    place: null,
    link_url: null,
    event_at: null,
    ...over,
  };
}

const NEWS = item('N1', {
  kind: 'news',
  title: 'Club fair Friday',
  description: 'Every club on one lawn.',
  price_cents: 0,
  condition: null,
  open_to_offers: false,
  place: 'Hamilton-Williams',
  link_url: 'https://www.forms.example.com/fair',
  event_at: at(60 * 24 * 2),
  photos: [1, 2, 3, 4].map((i) => ({
    path: `c/l/N1/p${i}.webp`,
    thumb_path: `c/l/N1/t${i}.webp`,
    blurhash: null,
    width: 100,
    height: 100,
  })),
});
const SALE = item('S1', { title: 'Desk lamp', price_cents: 1500 });
const MINE = item('M1', { title: 'My lamp', is_own: true });

function page(items: CampusItem[]): CampusPage {
  return {
    items,
    next_cursor: null,
    day_one: false,
    active_listings: 40,
    founding: { limit: 0, left: 0, mine: false },
  };
}

function Stub({ id }: { id: string }) {
  return <Text testID={id}>{id}</Text>;
}

function renderAt(routes: Record<string, () => ReactNode>, initialUrl: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderRouter(
    { index: () => <Stub id="screen-index" />, ...routes },
    { initialUrl, wrapper },
  );
}

const me = async () =>
  ({ display_name: 'Wasif K.', avatar_path: null, campus: { short_name: 'OWU' } }) as unknown as Me;

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});
afterEach(() => {
  jest.restoreAllMocks();
  act(() => useToastStore.getState().dismiss());
});

// ---------------------------------------------------------------------------------------------
describe('DEC 98 news form rules', () => {
  const form = (over: Partial<NewsForm> = {}): NewsForm => ({
    title: 'Club fair Friday',
    description: '',
    link: '',
    isEvent: false,
    eventAt: null,
    place: '',
    photos: [],
    ...over,
  });

  it('adds https:// to a bare link and checks it like the server', () => {
    expect(normalizeLink('  ')).toBeNull();
    expect(normalizeLink('forms.example.com/x')).toBe('https://forms.example.com/x');
    expect(normalizeLink('http://a.co')).toBe('http://a.co');
    expect(isValidLink('https://a.co/x')).toBe(true);
    expect(isValidLink('https://nodot')).toBe(false);
    expect(isValidLink('javascript:alert(1)')).toBe(false);
    expect(linkHost('https://www.forms.example.com/fair?x=1')).toBe('forms.example.com');
  });

  it('a plain post only needs a headline', () => {
    expect(validateNews(form(), NOW)).toEqual([]);
    expect(validateNews(form({ title: 'Hi' }), NOW)).toEqual([{ field: 'title', kind: 'short' }]);
    expect(validateNews(form({ link: 'not a link' }), NOW)).toEqual([
      { field: 'link', kind: 'invalid' },
    ]);
    expect(validateNews(form({ link: `a.co/${'x'.repeat(300)}` }), NOW)).toEqual([
      { field: 'link', kind: 'long' },
    ]);
    expect(validateNews(form({ place: 'x'.repeat(61) }), NOW)).toEqual([
      { field: 'place', kind: 'long' },
    ]);
  });

  it('an event needs a future time within 90 days', () => {
    expect(validateNews(form({ isEvent: true }), NOW)).toEqual([
      { field: 'event', kind: 'missing' },
    ]);
    expect(validateNews(form({ isEvent: true, eventAt: new Date(at(-1)) }), NOW)).toEqual([
      { field: 'event', kind: 'past' },
    ]);
    expect(validateNews(form({ isEvent: true, eventAt: new Date(at(60 * 24 * 91)) }), NOW)).toEqual(
      [{ field: 'event', kind: 'far' }],
    );
    expect(validateNews(form({ isEvent: true, eventAt: new Date(at(60)) }), NOW)).toEqual([]);
  });

  it('builds create_news arguments; the event is left out when the switch is off', () => {
    const when = new Date(at(120));
    expect(
      newsArgs(
        'L9',
        form({
          description: ' Bring a friend ',
          link: 'example.com',
          isEvent: true,
          eventAt: when,
          place: ' Lawn ',
        }),
      ),
    ).toEqual({
      id: 'L9',
      title: 'Club fair Friday',
      description: 'Bring a friend',
      photos: [],
      link_url: 'https://example.com',
      event_at: when.toISOString(),
      place: 'Lawn',
    });
    expect(newsArgs('L9', form({ isEvent: false, eventAt: when })).event_at).toBeNull();
  });

  it('labels, the daily cap and day + time', () => {
    expect(eventLabel(at(60 * 24 * 2), NOW)).toMatch(/ at /);
    expect(postErrorText({ code: 'RATE_LIMITED', action: 'create_news' })).toBe(
      campus.errors.newsCap,
    );
    const d = combineDayTime(new Date(2026, 9, 9), new Date(2000, 0, 1, 19, 30));
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
      2026, 9, 9, 19, 30,
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('DEC 98 Feed posts', () => {
  const saves = () => ({ save: jest.fn(async () => 1), unsave: jest.fn(async () => 0) });
  const open = (
    items: CampusItem[],
    over: Partial<Parameters<typeof CampusFeedScreen>[0]> = {},
  ) => {
    const api = { feed: jest.fn(async () => page(items)) } as unknown as CampusApi;
    renderAt(
      {
        feed: () => (
          <CampusFeedScreen
            api={api}
            now={() => NOW}
            mediaBase={() => 'http://m'}
            site={() => 'https://site'}
            loadMe={me}
            {...over}
          />
        ),
        'listing/[id]/index': () => <Stub id="screen-listing" />,
        'listing/[id]/offer': () => <Stub id="screen-offer" />,
        'sell/news': () => <Stub id="screen-news" />,
      },
      '/feed',
    );
    return api;
  };

  it('a news post: who, headline, event, place, photos and the link', async () => {
    const openUrl = jest.fn(async () => {});
    open([NEWS], { openUrl, saves: saves() });
    expect(await screen.findByText('Club fair Friday')).toBeTruthy();
    expect(screen.getByText('Chris A.')).toBeTruthy();
    expect(screen.getByText(/Hamilton-Williams/)).toBeTruthy();
    expect(screen.getByTestId('campus-item-N1-event')).toBeTruthy();
    expect(screen.getByText('forms.example.com')).toBeTruthy();
    // News takes no offers.
    expect(screen.queryByTestId('campus-item-N1-offer')).toBeNull();
    fireEvent.press(screen.getByTestId('campus-item-N1-open-link'));
    expect(openUrl).toHaveBeenCalledWith('https://www.forms.example.com/fair');
  });

  it('Save shows at once and calls save_listing', async () => {
    const s = saves();
    open([SALE], { saves: s });
    fireEvent.press(await screen.findByTestId('campus-item-S1-save'));
    expect(await screen.findByRole('button', { name: campus.saved })).toBeTruthy();
    expect(s.save).toHaveBeenCalledWith('S1');
  });

  it('Save goes back with a note when it fails', async () => {
    const s = { save: jest.fn(async () => Promise.reject(new Error('x'))), unsave: jest.fn() };
    open([SALE], { saves: s as unknown as Pick<FeedApi, 'save' | 'unsave'> });
    fireEvent.press(await screen.findByTestId('campus-item-S1-save'));
    await waitFor(() => expect(useToastStore.getState().current?.message).toBe(campus.saveFailed));
    expect(await screen.findByRole('button', { name: campus.save })).toBeTruthy();
  });

  it('a listing: Make offer opens the offer sheet, Share sends the link', async () => {
    const share = jest.fn(async () => {});
    open([SALE], { share });
    fireEvent.press(await screen.findByTestId('campus-item-S1-share'));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://site/l/S1' }));
    fireEvent.press(screen.getByTestId('campus-item-S1-offer'));
    expect(await screen.findByTestId('screen-offer')).toBeTruthy();
  });

  it('your own post: no Save or Make offer', async () => {
    open([MINE]);
    expect(await screen.findByText(campus.yours)).toBeTruthy();
    expect(screen.queryByTestId('campus-item-M1-save')).toBeNull();
    expect(screen.queryByTestId('campus-item-M1-offer')).toBeNull();
  });

  it('"What\'s happening on campus?" opens Post news; the News filter asks for news', async () => {
    const api = open([]);
    expect(await screen.findByText(campus.empty.all.title)).toBeTruthy();
    fireEvent.press(screen.getByRole('checkbox', { name: campus.filters.news }));
    await waitFor(() => expect(api.feed).toHaveBeenCalledWith('news', null));
    expect(await screen.findByText(campus.empty.news.title)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: campus.composerLabel }));
    expect(await screen.findByTestId('screen-news')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------
describe('DEC 98 Post news', () => {
  const posted = (): PostedListing => ({
    id: 'L9',
    status: 'active',
    kind: 'news',
    title: 'Club fair Friday',
    price_cents: 0,
    condition: null,
    photos: [],
  });
  const fakeApi = (over: Partial<NewsApi> = {}) =>
    ({
      reserveListingId: jest.fn(async () => 'L9'),
      uploadPhoto: jest.fn(async (_id: string, p: { uri: string }) => ({
        path: `c/l/L9/${p.uri}.webp`,
        thumbPath: `c/l/L9/${p.uri}_t.webp`,
        width: 100,
        height: 80,
        blurhash: null,
      })),
      createNews: jest.fn(async () => posted()),
      ...over,
    }) as unknown as Pick<SellApi, 'reserveListingId' | 'uploadPhoto'> & NewsApi;
  const granted = {
    get: jest.fn(async () => ({ status: 'granted' as const, canAskAgain: true })),
    request: jest.fn(async () => ({ status: 'granted' as const, canAskAgain: true })),
  };
  const show = (api: ReturnType<typeof fakeApi>, pick = jest.fn(async () => [])) =>
    renderAt(
      {
        'sell/news': () => (
          <PostNewsScreen
            api={api}
            pick={pick}
            photosOs={granted}
            mediaBase={() => 'http://m'}
            now={() => NOW}
          />
        ),
        feed: () => <Stub id="screen-feed" />,
      },
      '/sell/news',
    );

  it('shows every problem and posts nothing', async () => {
    const api = fakeApi();
    show(api);
    fireEvent.changeText(await screen.findByTestId('news-link'), 'nope');
    fireEvent.press(screen.getByRole('switch', { name: campus.newsEvent }));
    fireEvent.press(screen.getByTestId('news-post'));
    expect(await screen.findByTestId('news-fix')).toBeTruthy();
    expect(screen.getByText(campus.errors.titleShort)).toBeTruthy();
    expect(screen.getByText(campus.errors.linkInvalid)).toBeTruthy();
    expect(screen.getByTestId('news-event-error')).toBeTruthy();
    expect(api.createNews).not.toHaveBeenCalled();
  });

  it('posts with up to 4 photos and a link, then offers the Feed', async () => {
    const api = fakeApi();
    const pick = jest.fn(async (n: number) =>
      ['a', 'b', 'c', 'd', 'e'].slice(0, n).map((uri) => ({ uri, width: 100, height: 80 })),
    );
    show(api, pick as never);
    fireEvent.changeText(await screen.findByTestId('news-title'), 'Club fair Friday');
    fireEvent.changeText(screen.getByTestId('news-link'), 'forms.example.com/fair');
    fireEvent.press(screen.getByTestId('news-add-photo'));
    await waitFor(() => expect(api.uploadPhoto).toHaveBeenCalledTimes(4));
    expect(pick).toHaveBeenCalledWith(4);
    // Full: no more Add photos.
    await waitFor(() => expect(screen.queryByTestId('news-add-photo')).toBeNull());
    fireEvent.press(screen.getByTestId('news-post'));
    expect(await screen.findByTestId('news-posted')).toBeTruthy();
    expect(api.createNews).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'L9',
        title: 'Club fair Friday',
        link_url: 'https://forms.example.com/fair',
        event_at: null,
        photos: expect.arrayContaining([expect.objectContaining({ path: 'c/l/L9/a.webp' })]),
      }),
    );
    expect((api.createNews as jest.Mock).mock.calls[0][0].photos).toHaveLength(4);
    fireEvent.press(screen.getByTestId('news-posted-see'));
    expect(await screen.findByTestId('screen-feed')).toBeTruthy();
  });

  it('the daily cap gets its own line', async () => {
    const api = fakeApi({
      createNews: jest.fn(async () =>
        Promise.reject({ code: 'RATE_LIMITED', message: 'RATE_LIMITED:create_news:86400' }),
      ),
    });
    show(api);
    fireEvent.changeText(await screen.findByTestId('news-title'), 'Club fair Friday');
    fireEvent.press(screen.getByTestId('news-post'));
    expect(await screen.findByText(campus.errors.newsCap)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------
describe('DEC 98 news on the listing screen', () => {
  it('no price or offer; the event, and Open link', async () => {
    const openUrl = jest.fn(async () => {});
    const api = {
      getListing: jest.fn(async () => ({ ...NEWS, access: 'buyer' }) as ListingResult),
      recordView: jest.fn(async () => {}),
      save: jest.fn(async () => 1),
      unsave: jest.fn(async () => 0),
    } as unknown as FeedApi;
    renderAt(
      {
        'listing/[id]/index': () => (
          <ListingScreen
            id="N1"
            api={api}
            spots={async () => []}
            mediaBase={() => 'http://m'}
            site={() => 'https://site'}
            share={jest.fn(async () => {})}
            openUrl={openUrl}
            now={() => NOW}
          />
        ),
      },
      '/listing/N1',
    );
    expect(await screen.findByText(campus.listingNews)).toBeTruthy();
    expect(screen.getByTestId('listing-event')).toBeTruthy();
    expect(screen.queryByTestId('listing-offer')).toBeNull();
    expect(screen.queryByText(/meetup/i)).toBeNull();
    fireEvent.press(screen.getByTestId('listing-open-link'));
    expect(openUrl).toHaveBeenCalledWith('https://www.forms.example.com/fair');
  });
});
