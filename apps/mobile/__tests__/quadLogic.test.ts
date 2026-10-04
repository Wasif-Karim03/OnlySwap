import { routeForNotification } from '../src/lib/push';
import {
  aliasLetters,
  aliasSwatch,
  aliasTag,
  blockedKey,
  canAddOption,
  canAppeal,
  canPost,
  canRemoveOption,
  checkinBody,
  createVoteSender,
  heldKey,
  keywordValid,
  offersListing,
  placeValid,
  pollIssue,
  pollPercents,
  statusTone,
  tapVote,
  thumbPath,
  timeLeft,
  type PostDraft,
  type VoteState,
} from '../src/features/quad/logic';
import { blockedText, heldText } from '../src/features/quad/components/OutcomeSheet';
import { aliasName } from '../src/features/quad/components/ReplyRow';
import { endsLabel, repliesLabel } from '../src/features/quad/components/QuadPostCard';
import { quad } from '../src/strings/en';

describe('T-UNIT-QUAD-01 optimistic votes', () => {
  it('up from nothing adds one; tapping up again removes the vote', () => {
    const a = tapVote({ score: 10, myVote: 0 }, 1);
    expect(a).toEqual({ score: 11, myVote: 1 });
    expect(tapVote(a, 1)).toEqual({ score: 10, myVote: 0 });
  });

  it('switching from down to up moves the score by two', () => {
    expect(tapVote({ score: 5, myVote: -1 }, 1)).toEqual({ score: 7, myVote: 1 });
    expect(tapVote({ score: 5, myVote: 1 }, -1)).toEqual({ score: 3, myVote: -1 });
    expect(tapVote({ score: 5, myVote: -1 }, -1)).toEqual({ score: 6, myVote: 0 });
  });

  describe('debounce: only the last value is sent', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    type Send = (k: string, v: number) => Promise<VoteState>;
    function setup(
      send: jest.Mock<ReturnType<Send>, Parameters<Send>> = jest.fn(
        async (_k: string, v: number) => ({
          score: 99,
          myVote: v as VoteState['myVote'],
        }),
      ),
    ) {
      const settled: [string, VoteState][] = [];
      const errors: [string, VoteState][] = [];
      const sender = createVoteSender<string>({
        delayMs: 400,
        send: send as never,
        onSettled: (k, s) => settled.push([k, s]),
        onError: (k, s) => errors.push([k, s]),
      });
      return { sender, send, settled, errors };
    }

    it('rapid taps collapse to one call with the final value', async () => {
      const { sender, send, settled } = setup();
      let s: VoteState = { score: 0, myVote: 0 };
      for (const dir of [1, -1, 1, -1] as const) {
        const next = tapVote(s, dir);
        sender.push('post:a', s, next);
        s = next;
        jest.advanceTimersByTime(100);
      }
      expect(send).not.toHaveBeenCalled();
      jest.advanceTimersByTime(400);
      await Promise.resolve();
      await Promise.resolve();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith('post:a', -1);
      expect(settled).toEqual([['post:a', { score: 99, myVote: -1 }]]);
    });

    it('taps that cancel out send nothing', () => {
      const { sender, send, settled } = setup();
      const base = { score: 3, myVote: 0 as const };
      const up = tapVote(base, 1);
      sender.push('post:a', base, up);
      sender.push('post:a', up, tapVote(up, 1));
      jest.advanceTimersByTime(500);
      expect(send).not.toHaveBeenCalled();
      expect(settled).toEqual([['post:a', base]]);
    });

    it('a failed send reverts to the state before the burst', async () => {
      const { sender, errors } = setup(
        jest.fn(async (_k: string, _v: number): Promise<VoteState> => {
          throw new Error('offline');
        }),
      );
      const base = { score: 3, myVote: 0 as const };
      sender.push('post:a', base, tapVote(base, 1));
      jest.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
      expect(errors).toEqual([['post:a', base]]);
    });

    it('keys debounce separately', () => {
      const { sender, send } = setup();
      const base = { score: 0, myVote: 0 as const };
      sender.push('post:a', base, tapVote(base, 1));
      sender.push('post:b', base, tapVote(base, -1));
      jest.advanceTimersByTime(500);
      expect(send).toHaveBeenCalledWith('post:a', 1);
      expect(send).toHaveBeenCalledWith('post:b', -1);
    });
  });
});

describe('T-UNIT-QUAD-02 poll builder', () => {
  it('needs 2 to 4 options of 1 to 40 characters', () => {
    expect(pollIssue(['Yes'])).toBe('too_few');
    expect(pollIssue(['a', 'b', 'c', 'd', 'e'])).toBe('too_many');
    expect(pollIssue(['Yes', '  '])).toBe('empty_option');
    expect(pollIssue(['Yes', 'x'.repeat(41)])).toBe('option_too_long');
    expect(pollIssue(['Yes', 'x'.repeat(40)])).toBeNull();
    expect(pollIssue(['a', 'b', 'c', 'd'])).toBeNull();
  });

  it('add and remove stop at the limits', () => {
    expect(canAddOption(['a', 'b', 'c'])).toBe(true);
    expect(canAddOption(['a', 'b', 'c', 'd'])).toBe(false);
    expect(canRemoveOption(['a', 'b'])).toBe(false);
    expect(canRemoveOption(['a', 'b', 'c'])).toBe(true);
  });

  it('percent shares', () => {
    expect(pollPercents({ options: [{ id: '1', label: 'a', votes: 0 }], total: 0 })).toEqual([0]);
    expect(
      pollPercents({
        options: [
          { id: '1', label: 'a', votes: 1 },
          { id: '2', label: 'b', votes: 3 },
        ],
        total: 4,
      }),
    ).toEqual([25, 75]);
  });
});

describe('aliases (UX-11, D7)', () => {
  it('OP for 0, then letters, then double letters', () => {
    expect(aliasTag(0)).toBe('OP');
    expect(aliasTag(1)).toBe('A');
    expect(aliasTag(2)).toBe('B');
    expect(aliasTag(26)).toBe('Z');
    expect(aliasLetters(27)).toBe('AA');
    expect(aliasLetters(28)).toBe('AB');
    expect(aliasLetters(52)).toBe('AZ');
    expect(aliasLetters(53)).toBe('BA');
  });

  it('names and token colour slots', () => {
    expect(aliasName(0)).toBe('OP');
    expect(aliasName(1)).toBe('Anon A');
    expect(aliasSwatch(0)).toBe('accent');
    expect(aliasSwatch(1)).toBe('green');
    expect(aliasSwatch(5)).toBe('green');
    expect(new Set([1, 2, 3, 4].map(aliasSwatch)).size).toBe(4);
  });
});

describe('outcome copy (Q9, Q10)', () => {
  it('maps blocked reasons to their copy keys', () => {
    expect(blockedKey('pii:phone')).toEqual({ key: 'phone', term: null });
    expect(blockedKey('pii:email').key).toBe('email');
    expect(blockedKey('pii:url').key).toBe('url');
    expect(blockedKey('pii:handle').key).toBe('handle');
    expect(blockedKey('pii:room').key).toBe('room');
    expect(blockedKey('term:vape')).toEqual({ key: 'term', term: 'vape' });
    expect(blockedKey('pii:weird').key).toBe('other');
    expect(blockedKey(null).key).toBe('other');
    expect(blockedText('pii:phone')).toBe(quad.blocked.phone);
    expect(blockedText('term:vape')).toContain('"vape"');
  });

  it('offers a listing only for contact details', () => {
    expect(offersListing('pii:phone')).toBe(true);
    expect(offersListing('term:x')).toBe(false);
  });

  it('maps held reasons', () => {
    expect(heldKey('names_student')).toBe('names_student');
    expect(heldKey('new_account_photo')).toBe('new_account_photo');
    expect(heldKey('term:x')).toBe('term');
    expect(heldKey('reports')).toBe('other');
    expect(heldText('names_student')).toBe(quad.held.names_student);
  });

  it('status chips and appeals', () => {
    expect(statusTone('live')).toBe('green');
    expect(statusTone('held')).toBe('amber');
    expect(statusTone('hidden')).toBe('red');
    expect(canAppeal('live')).toBe(false);
    expect(canAppeal('removed')).toBe(true);
  });
});

describe('R2-QUAD-CHECKIN check-ins', () => {
  it('body joins the note and vibes, or falls back to the place', () => {
    expect(checkinBody('Plenty of seats', ['Quiet', 'Studying'], 'Library')).toBe(
      'Plenty of seats. Quiet, Studying',
    );
    expect(checkinBody('', ['Busy'], 'Union')).toBe('Busy');
    expect(checkinBody('  ', [], ' Union ')).toBe('Union');
    expect(checkinBody('x'.repeat(600), [], 'U')).toHaveLength(500);
  });

  it('place is 1 to 60 characters', () => {
    expect(placeValid(' ')).toBe(false);
    expect(placeValid('Thompson')).toBe(true);
    expect(placeValid('x'.repeat(61))).toBe(false);
  });

  it('time left and its label', () => {
    const now = new Date('2026-10-04T12:00:00Z');
    expect(timeLeft('2026-10-04T14:30:00Z', now)).toEqual({ h: 2, m: 30 });
    expect(timeLeft('2026-10-04T11:00:00Z', now)).toEqual({ h: 0, m: 0 });
    expect(endsLabel('2026-10-04T14:30:00Z', now)).toBe('Ends in 2 h 30 min');
    expect(endsLabel('2026-10-04T12:40:00Z', now)).toBe('Ends in 40 min');
  });
});

describe('new post rules', () => {
  const base: PostDraft = {
    mode: 'text',
    body: '',
    photoPath: null,
    photoBusy: false,
    options: ['', ''],
    place: '',
  };
  it('text needs 1 to 500 characters', () => {
    expect(canPost(base)).toBe(false);
    expect(canPost({ ...base, body: 'hi' })).toBe(true);
    expect(canPost({ ...base, body: 'x'.repeat(501) })).toBe(false);
  });
  it('photo needs an uploaded photo', () => {
    expect(canPost({ ...base, mode: 'photo', body: 'hi' })).toBe(false);
    expect(canPost({ ...base, mode: 'photo', body: 'hi', photoPath: 'k', photoBusy: true })).toBe(
      false,
    );
    expect(canPost({ ...base, mode: 'photo', body: 'hi', photoPath: 'k' })).toBe(true);
  });
  it('poll needs a valid poll', () => {
    expect(canPost({ ...base, mode: 'poll', body: 'Q?' })).toBe(false);
    expect(canPost({ ...base, mode: 'poll', body: 'Q?', options: ['a', 'b'] })).toBe(true);
  });
  it('check-in needs a place only', () => {
    expect(canPost({ ...base, mode: 'checkin' })).toBe(false);
    expect(canPost({ ...base, mode: 'checkin', place: 'Union' })).toBe(true);
  });
  it('helpers', () => {
    expect(thumbPath('c/1/quad/p/u_full.webp')).toBe('c/1/quad/p/u_thumb.webp');
    expect(keywordValid('a')).toBe(false);
    expect(keywordValid('finals')).toBe(true);
    expect(keywordValid('x'.repeat(31))).toBe(false);
    expect(repliesLabel(1)).toBe('1 reply');
    expect(repliesLabel(3)).toBe('3 replies');
  });
});

describe('push routing for Quad notifications', () => {
  it('opens the thread', () => {
    expect(routeForNotification({ type: 'quad_reply', post_id: 'p1' })).toEqual({
      pathname: '/quad/[id]',
      params: { id: 'p1' },
    });
    expect(routeForNotification({ type: 'quad_milestone', post_id: 'p2' })).toEqual({
      pathname: '/quad/[id]',
      params: { id: 'p2' },
    });
  });
});
