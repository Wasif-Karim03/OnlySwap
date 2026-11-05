import { kindIcon } from '../src/features/feed/ListingScreen';
import { unavailableCopy } from '../src/features/offers/OfferSheetScreen';
import { offers } from '../src/strings/en';

describe('QA-M16 the offer sheet never repeats its title', () => {
  it('a held listing says on hold, try later', () => {
    expect(unavailableCopy('unavailable', 'hold')).toEqual({
      title: offers.holdTitle,
      body: offers.holdBody,
    });
    expect(unavailableCopy(null, 'hold').title).toBe('On hold right now');
  });
  it('other unavailable listings get a body that adds something', () => {
    for (const status of ['sold', 'removed', null]) {
      const { title, body } = unavailableCopy('unavailable', status);
      expect(title).toBe(offers.unavailableTitle);
      expect(body).not.toContain(title);
    }
  });
  it('paused accounts keep the paused copy', () => {
    expect(unavailableCopy('paused', 'active').title).toBe(offers.pausedTitle);
  });
});

describe('QA-M7 kindIcon', () => {
  it('maps each post kind to an icon, sale by default', () => {
    expect(['food', 'wanted', 'news', 'free', 'sale'].map(kindIcon)).toEqual([
      'food',
      'search',
      'quad',
      'gift',
      'tag',
    ]);
  });
});
