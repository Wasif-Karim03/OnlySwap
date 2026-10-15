import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';

import { trustLine, type FeedItem } from '../src/features/feed/logic';
import { addViewed, parseViewed, rememberViewed, VIEWED_MAX } from '../src/features/feed/recent';
import { SwipeCard, cardLabel, type DeckCard } from '../src/features/feed/SwipeCard';
import { addStarter, titleExample } from '../src/features/sell/help';
import type { SearchApi } from '../src/features/search/api';
import { SearchScreen } from '../src/features/search/SearchScreen';

const seller = (over: Partial<FeedItem['seller']> = {}): FeedItem['seller'] => ({
  id: 's1',
  display_name: 'Maya R.',
  avatar_path: null,
  year: null,
  created_at: null,
  ...over,
});

describe('T-UNIT-TRUST-01 trust line on the card (DEC 124)', () => {
  it('says verified student with no stats yet, and on older cached cards', () => {
    expect(trustLine(seller())).toBe('Verified student');
    expect(trustLine(seller({ swaps_count: 0, thumbs_up: 0, thumbs_total: 0 }))).toBe(
      'Verified student',
    );
  });

  it('shows swaps until there are 3 ratings', () => {
    expect(trustLine(seller({ swaps_count: 1, thumbs_up: 0, thumbs_total: 1 }))).toBe(
      'Verified student · 1 swap',
    );
    expect(trustLine(seller({ swaps_count: 4, thumbs_up: 2, thumbs_total: 2 }))).toBe(
      'Verified student · 4 swaps',
    );
  });

  it('shows the thumbs-up percentage from 3 ratings', () => {
    expect(trustLine(seller({ swaps_count: 5, thumbs_up: 2, thumbs_total: 3 }))).toBe(
      'Verified student · 67% thumbs up',
    );
  });

  it('renders on the card and is read out, but not on compact grid tiles', () => {
    const card: DeckCard = {
      id: 'l1',
      title: 'Desk lamp',
      price: '$15',
      meta: 'Good',
      sellerName: 'Maya R.',
      sellerAvatar: null,
      photos: [],
      saveCount: 0,
      trust: 'Verified student · 3 swaps',
    };
    render(<SwipeCard card={card} />);
    expect(screen.getByText('Verified student · 3 swaps')).toBeTruthy();
    expect(cardLabel(card)).toContain('Verified student · 3 swaps');
    screen.unmount();
    render(<SwipeCard card={card} compact />);
    expect(screen.queryByTestId('card-trust')).toBeNull();
  });
});

const item = (id: string, title: string): FeedItem =>
  ({
    id,
    kind: 'sale',
    status: 'active',
    title,
    price_cents: 1500,
    photos: [],
    seller: seller(),
  }) as unknown as FeedItem;

describe('T-UNIT-RECENT-01 recently viewed (DEC 128)', () => {
  it('keeps the newest 20 ids, no repeats', () => {
    expect(addViewed(['a', 'b'], 'b')).toEqual(['b', 'a']);
    const many = Array.from({ length: 25 }, (_, i) => `x${i}`);
    expect(addViewed(many, 'new')).toHaveLength(VIEWED_MAX);
    expect(parseViewed('junk')).toEqual([]);
    expect(parseViewed(['a', 3, 'b'])).toEqual(['a', 'b']);
  });

  it('remembers a view, and survives broken storage', () => {
    let saved: unknown = ['a'];
    rememberViewed('b', { get: () => saved, set: (v) => (saved = v) });
    expect(saved).toEqual(['b', 'a']);
    expect(() =>
      rememberViewed('c', {
        get: () => {
          throw new Error('no storage');
        },
        set: () => {},
      }),
    ).not.toThrow();
  });

  it('Search shows recently viewed before you type', async () => {
    const byIds = jest.fn(async () => [item('l1', 'Desk lamp'), item('l2', 'Mini fridge')]);
    const api = { suggest: jest.fn(async () => []) } as unknown as SearchApi;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    renderRouter(
      {
        search: () => (
          <SearchScreen
            api={api}
            recentStorage={{ get: () => [], set: () => {} }}
            more={{ similar: jest.fn(), byIds }}
            viewedStore={{ get: () => ['l1', 'l2'], set: () => {} }}
            mediaBase={() => 'http://m'}
          />
        ),
        'listing/[id]': () => null,
      },
      { initialUrl: '/search', wrapper },
    );
    expect(await screen.findByTestId('search-recently-viewed')).toBeTruthy();
    expect(byIds).toHaveBeenCalledWith(['l1', 'l2']);
    fireEvent.press(screen.getByTestId('search-recently-viewed-l2'));
    await waitFor(() => expect(screen.queryByTestId('search-recently-viewed')).toBeNull());
  });
});

describe('T-UNIT-HELP-01 listing help (DEC 129)', () => {
  const cats = [
    { id: 3, name: 'Tech', parentId: null },
    { id: 32, name: 'Laptops', parentId: 3 },
  ];
  it('shows the example for the top-level category, or a general one', () => {
    expect(titleExample(cats, null)).toBe('Example: Brand, item, then size or model');
    expect(titleExample(cats, 32)).toBe('Example: Dell 27 inch monitor, 1440p');
  });
  it('adds a quick detail once, on its own line, within the limit', () => {
    expect(addStarter('', 'barely')).toBe('Barely used.');
    expect(addStarter('Blue.', 'pets')).toBe('Blue.\nPet-free home.');
    expect(addStarter('Blue.\nPet-free home.', 'pets')).toBe('Blue.\nPet-free home.');
    const full = 'x'.repeat(995);
    expect(addStarter(full, 'works')).toBe(full);
  });
});
