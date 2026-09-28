import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import type { FeedItem } from '../src/features/feed/logic';
import type { ProfileApi, ProfileResult, PublicProfile } from '../src/features/profiles/api';
import {
  joinedLabel,
  ProfileViewScreen,
  replyLabel,
  swapsLabel,
  thumbsLabel,
} from '../src/features/profiles/ProfileViewScreen';
import {
  priceDropped,
  SavedScreen,
  searchTitle,
  type SavedItem,
} from '../src/features/saved/SavedScreen';
import type { SearchApi } from '../src/features/search/api';
import { profileView, saved } from '../src/strings/en';

const item = (n: number, patch: Partial<SavedItem> = {}): SavedItem =>
  ({
    id: `id-${n}`,
    kind: 'sale',
    status: 'active',
    title: `Item ${n}`,
    price_cents: 1000,
    price_at_save: 1000,
    saved_at: '',
    photos: [],
    ...patch,
  }) as unknown as SavedItem;

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
      discover: () => <Stub id="screen-discover" />,
      'listing/[id]/index': () => <Stub id="screen-listing" />,
      'search/results': () => <Stub id="screen-results" />,
      ...routes,
    },
    { initialUrl, wrapper },
  );
}

function searchApi(over: Partial<SearchApi> = {}): SearchApi {
  return {
    search: jest.fn(async () => []),
    suggest: jest.fn(async () => []),
    saveSearch: jest.fn(),
    listSaved: jest.fn(async () => []),
    updateSaved: jest.fn(async () => ({}) as never),
    deleteSaved: jest.fn(async () => {}),
    newCounts: jest.fn(async () => []),
    ...over,
  };
}

describe('B09 Saved', () => {
  it('flags price drops but not on sold items', () => {
    expect(priceDropped({ price_at_save: 1500, price_cents: 1200, status: 'active' })).toBe(true);
    expect(priceDropped({ price_at_save: 1500, price_cents: 1200, status: 'sold' })).toBe(false);
    expect(priceDropped({ price_at_save: null, price_cents: 1200, status: 'active' })).toBe(false);
    expect(searchTitle({ query: null })).toBe(saved.filtersOnly);
  });

  it('items: price drop note, unsave removes', async () => {
    const unsave = jest.fn(async () => 0);
    render(
      {
        saved: () => (
          <SavedScreen
            items={async () => [item(1, { price_cents: 800 }), item(2, { status: 'sold' })]}
            api={{ unsave }}
            searches={searchApi()}
            mediaBase={() => 'http://m'}
          />
        ),
      },
      '/saved',
    );
    expect(await screen.findByText(saved.priceDropped)).toBeTruthy();
    fireEvent.press(screen.getByTestId('unsave-id-1'));
    await waitFor(() => expect(unsave).toHaveBeenCalledWith('id-1'));
    await waitFor(() => expect(screen.queryByTestId('saved-id-1')).toBeNull());
  });

  it('items empty state', async () => {
    render(
      {
        saved: () => (
          <SavedScreen items={async () => []} api={{ unsave: jest.fn() }} searches={searchApi()} />
        ),
      },
      '/saved',
    );
    expect(await screen.findByTestId('saved-items-empty')).toBeTruthy();
  });

  it('searches: new counts, alerts toggle, delete, open', async () => {
    const api = searchApi({
      listSaved: jest.fn(async () => [
        {
          id: 's1',
          query: 'bike',
          filters: { max_cents: 5000 },
          alerts: true,
          last_seen_at: '',
          created_at: '',
        },
      ]),
      newCounts: jest.fn(async () => [{ id: 's1', new_count: 3 }]),
    });
    render(
      {
        saved: () => (
          <SavedScreen items={async () => []} api={{ unsave: jest.fn() }} searches={api} />
        ),
      },
      '/saved',
    );
    fireEvent.press(await screen.findByText(saved.searches));
    expect(await screen.findByText('3 new')).toBeTruthy();
    fireEvent.press(screen.getByRole('switch'));
    await waitFor(() => expect(api.updateSaved).toHaveBeenCalledWith('s1', { alerts: false }));
    fireEvent.press(screen.getByTestId('open-search-s1'));
    expect(await screen.findByTestId('screen-results')).toBeTruthy();
  });
});

const profile = (patch: Partial<PublicProfile> = {}): PublicProfile => ({
  id: 'u1',
  access: 'ok',
  display_name: 'Aisha A.',
  year: 'junior',
  avatar_path: null,
  created_at: '2026-09-01T12:00:00Z',
  founding_seller: false,
  swaps_count: 0,
  thumbs_up: 0,
  thumbs_total: 0,
  median_reply_minutes: null,
  new_seller: true,
  listings: [
    {
      id: 'l1',
      kind: 'sale',
      status: 'active',
      title: 'Lamp',
      price_cents: 1200,
      photos: [],
    } as unknown as FeedItem,
  ],
  reviews: [],
  ...patch,
});

function profileApi(result: ProfileResult, over: Partial<ProfileApi> = {}): ProfileApi {
  return {
    getProfile: jest.fn(async () => result),
    block: jest.fn(async () => {}),
    unblock: jest.fn(async () => {}),
    reportUser: jest.fn(async () => {}),
    ...over,
  };
}

describe('B10 Seller profile', () => {
  it('labels', () => {
    expect(swapsLabel(1)).toBe(profileView.swapsOne);
    expect(swapsLabel(4)).toBe('4 swaps');
    expect(thumbsLabel(0, 0)).toBe(profileView.noRatings);
    expect(thumbsLabel(9, 10)).toBe('90% thumbs up');
    expect(replyLabel(null)).toBeNull();
    expect(replyLabel(12)).toBe('Usually replies in 12 min');
    expect(replyLabel(150)).toBe('Usually replies in 3 h');
    expect(joinedLabel('2026-09-15T12:00:00Z')).toContain('2026');
  });

  it('shows a new seller with listings and opens one', async () => {
    const api = profileApi(profile());
    render(
      { 'user/[id]': () => <ProfileViewScreen id="u1" api={api} mediaBase={() => 'http://m'} /> },
      '/user/u1',
    );
    expect(await screen.findByTestId('profile-new-seller')).toBeTruthy();
    expect(screen.getByText(profileView.years.junior, { exact: false })).toBeTruthy();
    fireEvent.press(screen.getByTestId('profile-listing-l1'));
    expect(await screen.findByTestId('screen-listing')).toBeTruthy();
  });

  it('blocks from the options', async () => {
    const getProfile = jest
      .fn()
      .mockResolvedValueOnce(profile())
      .mockResolvedValue({ id: 'u1', access: 'blocked', display_name: 'Aisha A.' });
    const api = profileApi(profile(), { getProfile });
    render({ 'user/[id]': () => <ProfileViewScreen id="u1" api={api} /> }, '/user/u1');
    fireEvent.press(await screen.findByTestId('profile-more'));
    fireEvent.press(await screen.findByText('Block Aisha A.'));
    fireEvent.press(await screen.findByText(profileView.blockConfirm));
    await waitFor(() => expect(api.block).toHaveBeenCalledWith('u1'));
    expect(await screen.findByTestId('screen-profile-blocked')).toBeTruthy();
  });

  it('blocked state can unblock', async () => {
    const api = profileApi({ id: 'u1', access: 'blocked', display_name: 'Aisha A.' });
    render({ 'user/[id]': () => <ProfileViewScreen id="u1" api={api} /> }, '/user/u1');
    fireEvent.press(await screen.findByText(profileView.unblock));
    await waitFor(() => expect(api.unblock).toHaveBeenCalledWith('u1'));
  });

  it('gone state', async () => {
    render(
      {
        'user/[id]': () => (
          <ProfileViewScreen id="u1" api={profileApi({ id: 'u1', access: 'gone' })} />
        ),
      },
      '/user/u1',
    );
    expect(await screen.findByTestId('screen-profile-gone')).toBeTruthy();
  });

  it('my own profile has no report or block', async () => {
    render(
      {
        'user/[id]': () => (
          <ProfileViewScreen id="u1" api={profileApi(profile({ access: 'me' }))} />
        ),
      },
      '/user/u1',
    );
    expect(await screen.findByTestId('screen-profile')).toBeTruthy();
    expect(screen.queryByTestId('profile-more')).toBeNull();
  });
});
