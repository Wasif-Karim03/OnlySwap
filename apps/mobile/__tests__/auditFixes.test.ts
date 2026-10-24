// Fixes from the 2026-10-24 device audit (fix/audit-1).
import { dealStatusLabel } from '../src/features/chat/logic';
import { profileStats } from '../src/features/me/MeScreens';
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
});
