// UX audit fixes (2026-10-25): the pure pieces behind the P0 fixes.
import { canBlock } from '../src/components/ReportSheet';
import {
  PENDING_LISTING_MS,
  rememberListingLink,
  takeListingLink,
} from '../src/features/auth/pendingLink';
import { scamHint } from '../src/features/chat/logic';
import { HANDOFF_REVEAL_MS, handoffVisible } from '../src/features/meetups/Handoff';
import { LAST_MEETUP_HOUR, timeOptions } from '../src/features/meetups/logic';
import { markOfferSent, takeOfferSent } from '../src/features/offers/sentOffers';
import { CHECKINS_ENABLED } from '../src/features/quad/QuadNewPostScreen';

function memory() {
  const m = new Map<string, unknown>();
  return {
    get: (k: string) => m.get(k),
    set: (k: string, v: unknown) => void m.set(k, v),
    remove: (k: string) => void m.delete(k),
  } as never;
}

describe('Quad safety (DEC 150: real names)', () => {
  it('Quad posts and replies can be blocked; listings still cannot', () => {
    expect(canBlock('quad_post')).toBe(true);
    expect(canBlock('quad_reply')).toBe(true);
    expect(canBlock('listing')).toBe(false);
  });

  it('check-ins are off', () => {
    expect(CHECKINS_ENABLED).toBe(false);
  });
});

describe('scam hint catches moving the chat off the app', () => {
  it.each([
    'add my snap jdoe',
    'my ig: jo',
    'dm me @jordan.k',
    'text me on WhatsApp',
    'Discord?',
    'what is the code? 4821',
  ])('%s', (text) => expect(scamHint(text)).toBe('phone'));
  it.each(['is it big?', 'meet at 3pm', 'the snapshot looks good', 'is it still $40'])(
    'leaves %s alone',
    (text) => expect(scamHint(text)).toBeNull(),
  );
});

describe('meetups', () => {
  it('last slot is 8 PM', () => {
    const slots = timeOptions(new Date(2027, 2, 11), new Date(2027, 2, 10, 12));
    expect(slots[slots.length - 1]!.getHours()).toBe(LAST_MEETUP_HOUR);
  });

  it('the handoff code shows only from 30 minutes before the start', () => {
    const start = new Date(2027, 2, 10, 15, 0).toISOString();
    expect(handoffVisible(start, new Date(2027, 2, 9, 15, 0))).toBe(false);
    expect(handoffVisible(start, new Date(Date.parse(start) - HANDOFF_REVEAL_MS - 1))).toBe(false);
    expect(handoffVisible(start, new Date(Date.parse(start) - HANDOFF_REVEAL_MS))).toBe(true);
    expect(handoffVisible(start, new Date(2027, 2, 10, 16, 0))).toBe(true);
  });
});

describe('a right swipe waits for the offer', () => {
  it('reports a sent offer once', () => {
    expect(takeOfferSent('L1')).toBe(false);
    markOfferSent('L1');
    expect(takeOfferSent('L1')).toBe(true);
    expect(takeOfferSent('L1')).toBe(false);
  });
});

describe('shared listing link while signed out', () => {
  it('opens once after sign-in, within a day', () => {
    const s = memory();
    const now = new Date('2027-03-10T12:00:00Z');
    rememberListingLink('L9', s, now);
    expect(takeListingLink(s, now)).toBe('L9');
    expect(takeListingLink(s, now)).toBeNull();
  });

  it('expires after a day', () => {
    const s = memory();
    const now = new Date('2027-03-10T12:00:00Z');
    rememberListingLink('L9', s, now);
    expect(takeListingLink(s, new Date(now.getTime() + PENDING_LISTING_MS + 1))).toBeNull();
  });
});
