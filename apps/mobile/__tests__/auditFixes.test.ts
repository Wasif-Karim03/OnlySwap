// Fixes from the 2026-10-24 device audit (fix/audit-1).
import { dealPriceLine, dealStatusLabel } from '../src/features/chat/logic';
import { isFeedPost } from '../src/features/me/api';
import { profileStats } from '../src/features/me/MeScreens';
import { priceInput, validateDetails } from '../src/features/sell/logic';
import { chat, me, saved } from '../src/strings';
import { es } from '../src/strings/es';

const counts = { sold: 0, swaps: 0, thumbs_up: 0, thumbs_total: 0 };

describe('audit fixes', () => {
  it('the chat item bar says Sold once the deal is finished, Accepted before', () => {
    const base = { listing_status: 'hold', buyer_outcome: null, seller_outcome: null };
    expect(dealStatusLabel(base)).toBe(chat.accepted);
    expect(dealStatusLabel({ ...base, buyer_outcome: 'done' })).toBe(chat.accepted);
    expect(dealStatusLabel({ ...base, buyer_outcome: 'done', seller_outcome: 'done' })).toBe(
      chat.soldStatus,
    );
    expect(dealStatusLabel({ ...base, listing_status: 'sold' })).toBe(chat.soldStatus);
  });

  it('profile stats use the singular for exactly one', () => {
    const one = profileStats(
      { counts: { ...counts, sold: 1, swaps: 1 }, created_at: '2026-10-01' } as never,
      'en-US',
    );
    expect(one[0]!.template).toBe(me.statsSoldOne);
    expect(one[1]!.template).toBe(me.statsSwapsOne);
    const two = profileStats(
      { counts: { ...counts, sold: 2, swaps: 2 }, created_at: '2026-10-01' } as never,
      'en-US',
    );
    expect(two[1]!.template).toBe(me.statsSwaps);
  });

  it('Saved points people at the bookmark, not the heart (DEC 144)', () => {
    expect(saved.emptyItemsBody).toMatch(/bookmark/);
    expect(saved.emptyItemsBody).not.toMatch(/heart/);
    expect(es.saved.emptyItemsBody).not.toMatch(/corazón/);
  });

  it('a price of 0 turns the listing into a give-away', () => {
    expect(priceInput('0')).toEqual({ kind: 'free', price: '' });
    expect(priceInput('$0.00')).toEqual({ kind: 'free', price: '' });
    expect(priceInput('10')).toEqual({ price: '10' });
    expect(priceInput('0.5')).toEqual({ price: '0.5' });
    // A give-away needs no price or category.
    expect(
      validateDetails({
        kind: 'free',
        title: 'Desk lamp',
        categoryId: null,
        price: '',
        description: '',
      }),
    ).toEqual([]);
  });

  it('feed posts are kept apart from things for sale', () => {
    expect(['wanted', 'food', 'news'].every(isFeedPost)).toBe(true);
    expect(['sale', 'free'].some(isFeedPost)).toBe(false);
  });

  it('a chat from "I have this" reads as an ask, not an accepted deal (DEC 149)', () => {
    const ask = {
      offer_id: null,
      listing_status: 'active',
      buyer_outcome: null,
      seller_outcome: null,
    };
    expect(dealStatusLabel(ask)).toBeNull();
    expect(dealStatusLabel({ ...ask, listing_status: 'sold' })).toBe(chat.soldStatus);
    const money = (c: number) => `$${c / 100}`;
    expect(dealPriceLine({ offer_id: null, agreed_cents: 5000 }, money)).toBe(
      'Asked for, up to $50',
    );
    expect(dealPriceLine({ offer_id: null, agreed_cents: 0 }, money)).toBe(chat.wantedAsk);
    expect(dealPriceLine({ offer_id: 'o1', agreed_cents: 900 }, money)).toBe('$9 in person');
  });
});
