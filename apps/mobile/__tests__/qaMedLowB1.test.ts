import { isDealDone } from '../src/features/chat/logic';
import { fill, formatTime } from '../src/lib/format';
import { feed, system } from '../src/strings/en';
import { es } from '../src/strings/es';

describe('QA-M4 fill keeps one period after a name that ends in one', () => {
  it('collapses "M.." to "M."', () => {
    expect(fill('Waiting for {name}.', { name: 'Riley M.' })).toBe('Waiting for Riley M.');
  });
  it('keeps the template period after other names', () => {
    expect(fill('Waiting for {name}.', { name: 'Riley' })).toBe('Waiting for Riley.');
  });
  it('leaves a value period alone when the template does not add one', () => {
    expect(fill('{name} replied', { name: 'Riley M.' })).toBe('Riley M. replied');
  });
  it('still leaves unknown placeholders visible', () => {
    expect(fill('Hi {name}.', {})).toBe('Hi {name}.');
  });
});

describe('QA-M3 isDealDone', () => {
  const base = { listing_status: 'active', buyer_outcome: null, seller_outcome: null };
  it('is false for an open deal and when only one side said done', () => {
    expect(isDealDone(base)).toBe(false);
    expect(isDealDone({ ...base, buyer_outcome: 'done' })).toBe(false);
  });
  it('is true once sold or both sides said done', () => {
    expect(isDealDone({ ...base, listing_status: 'sold' })).toBe(true);
    expect(isDealDone({ ...base, buyer_outcome: 'done', seller_outcome: 'done' })).toBe(true);
  });
});

describe('QA-L8 times never split before AM/PM', () => {
  it('uses no breaking spaces', () => {
    const t = formatTime(new Date('2027-03-14T00:42:00Z'), 'UTC', 'en-US');
    expect(t).toMatch(/^12:42 AM$/);
    expect(formatTime(new Date('2027-03-14T16:30:00Z'), 'UTC', 'es-US')).not.toMatch(/ /);
  });
});

describe('QA-L1 and L6 copy', () => {
  it('has a singular offer count in both locales', () => {
    expect(feed.statOffersOne).toBe('1 offer');
    expect(es.feed.statOffersOne).toBe('1 oferta');
  });
  it('not-found matches the legal missing-page title', () => {
    expect(system.notFoundTitle).toBe("We couldn't find that page");
  });
});
