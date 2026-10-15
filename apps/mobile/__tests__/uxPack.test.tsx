import { render, screen } from '@testing-library/react-native';

import { trustLine, type FeedItem } from '../src/features/feed/logic';
import { SwipeCard, cardLabel, type DeckCard } from '../src/features/feed/SwipeCard';

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
