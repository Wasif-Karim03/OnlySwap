import type { QuadPoll, QuadStatus, VoteValue } from './api';

/**
 * Pure Quad logic (T-UNIT-QUAD-01, T-UNIT-QUAD-02): optimistic votes, poll
 * builder rules, alias labels, outcome copy keys and check-in text.
 */

// ---------------------------------------------------------------------------
// Votes (T-UNIT-QUAD-01)

export type VoteState = { score: number; myVote: VoteValue };

/** Tapping the arrow you already chose removes the vote; the score moves by the change. */
export function tapVote(current: VoteState, dir: 1 | -1): VoteState {
  const next: VoteValue = current.myVote === dir ? 0 : dir;
  return { myVote: next, score: current.score + (next - current.myVote) };
}

export const VOTE_DEBOUNCE_MS = 400;

type Timer = ReturnType<typeof setTimeout>;

export type VoteSenderOptions<K> = {
  delayMs?: number;
  /** Sends the final value; resolves with the server's score. */
  send: (key: K, value: VoteValue) => Promise<VoteState>;
  /** The server answered (or nothing needed sending). */
  onSettled: (key: K, state: VoteState) => void;
  /** The send failed: show `revertTo` again. */
  onError: (key: K, revertTo: VoteState, error: unknown) => void;
};

/**
 * Rapid taps on one post collapse into one call carrying the last value. If
 * the taps cancel out (up, then up again), nothing is sent at all.
 */
export function createVoteSender<K>({
  delayMs = VOTE_DEBOUNCE_MS,
  send,
  onSettled,
  onError,
}: VoteSenderOptions<K>) {
  const pending = new Map<K, { timer: Timer; base: VoteState }>();
  return {
    push(key: K, before: VoteState, after: VoteState) {
      const open = pending.get(key);
      if (open) clearTimeout(open.timer);
      const base = open ? open.base : before;
      const timer = setTimeout(() => {
        pending.delete(key);
        if (after.myVote === base.myVote) {
          onSettled(key, base);
          return;
        }
        send(key, after.myVote).then(
          (state) => onSettled(key, state),
          (e: unknown) => onError(key, base, e),
        );
      }, delayMs);
      pending.set(key, { timer, base });
    },
    pending: (key: K) => pending.has(key),
  };
}

// ---------------------------------------------------------------------------
// Polls (T-UNIT-QUAD-02)

export const POLL_MIN = 2;
export const POLL_MAX = 4;
export const POLL_OPTION_MAX = 40;

export type PollIssue = 'too_few' | 'too_many' | 'empty_option' | 'option_too_long';

/** What is wrong with a poll draft, or null when it can be posted. */
export function pollIssue(options: string[]): PollIssue | null {
  const trimmed = options.map((o) => o.trim());
  if (trimmed.length < POLL_MIN) return 'too_few';
  if (trimmed.length > POLL_MAX) return 'too_many';
  if (trimmed.some((o) => o.length === 0)) return 'empty_option';
  if (trimmed.some((o) => o.length > POLL_OPTION_MAX)) return 'option_too_long';
  return null;
}

export function canAddOption(options: string[]): boolean {
  return options.length < POLL_MAX;
}

export function canRemoveOption(options: string[]): boolean {
  return options.length > POLL_MIN;
}

/** Whole-number share of each option; 0 everywhere before anyone votes. */
export function pollPercents(poll: Pick<QuadPoll, 'options' | 'total'>): number[] {
  if (poll.total <= 0) return poll.options.map(() => 0);
  return poll.options.map((o) => Math.round((o.votes / poll.total) * 100));
}

// ---------------------------------------------------------------------------
// Aliases (UX-11, D7): OP for the poster, then letters A..Z, AA, AB ...

export function aliasLetters(n: number): string {
  let x = Math.max(1, Math.floor(n));
  let out = '';
  while (x > 0) {
    const r = (x - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    x = Math.floor((x - 1) / 26);
  }
  return out;
}

/** The label a reply shows: "OP" for alias 0, otherwise "A", "B" ... */
export function aliasTag(aliasNo: number): string {
  return aliasNo <= 0 ? 'OP' : aliasLetters(aliasNo);
}

/** Colour slot from the token set (not a raw colour); OP always uses the accent fill. */
export type AliasSwatch = 'accent' | 'green' | 'amber' | 'red' | 'neutral';
const SWATCHES: AliasSwatch[] = ['green', 'amber', 'red', 'neutral'];

export function aliasSwatch(aliasNo: number): AliasSwatch {
  if (aliasNo <= 0) return 'accent';
  return SWATCHES[(aliasNo - 1) % SWATCHES.length]!;
}

// ---------------------------------------------------------------------------
// Outcomes (Q9 blocked, Q10 held)

export type BlockedKey = 'phone' | 'email' | 'url' | 'handle' | 'room' | 'term' | 'other';

/** `pii:phone` -> phone, `term:<word>` -> term (the word is shown). */
export function blockedKey(reason: string | null | undefined): {
  key: BlockedKey;
  term: string | null;
} {
  const r = reason ?? '';
  if (r.startsWith('term:')) return { key: 'term', term: r.slice(5) || null };
  if (r.startsWith('pii:')) {
    const kind = r.slice(4);
    if (['phone', 'email', 'url', 'handle', 'room'].includes(kind)) {
      return { key: kind as BlockedKey, term: null };
    }
  }
  return { key: 'other', term: null };
}

/** Contact details mean "selling something"; offer the listing route then. */
export function offersListing(reason: string | null | undefined): boolean {
  return (reason ?? '').startsWith('pii:');
}

export type HeldKey = 'names_student' | 'term' | 'new_account_photo' | 'other';

export function heldKey(reason: string | null | undefined): HeldKey {
  const r = reason ?? '';
  if (r === 'names_student' || r === 'new_account_photo') return r;
  if (r.startsWith('term:')) return 'term';
  return 'other';
}

// ---------------------------------------------------------------------------
// Status chips (Q12)

export type StatusTone = 'neutral' | 'green' | 'amber' | 'red';

export function statusTone(status: QuadStatus): StatusTone {
  if (status === 'live') return 'green';
  if (status === 'held') return 'amber';
  return 'red';
}

/** Held, hidden and removed posts can be appealed; live ones can't. */
export function canAppeal(status: QuadStatus): boolean {
  return status !== 'live';
}

// ---------------------------------------------------------------------------
// Check-ins (R2-QUAD-CHECKIN)

export const PLACE_MAX = 60;
export const BODY_MAX = 500;
export const REPLY_MAX = 300;
export const CHECKIN_HOURS = 3;
export const VIBES = ['quiet', 'busy', 'studying', 'hanging'] as const;
export type Vibe = (typeof VIBES)[number];

/**
 * Body for a check-in: what they wrote plus the vibe words, kept under the
 * limit. With neither, the place itself is the body (the server needs one).
 */
export function checkinBody(text: string, vibeLabels: string[], place: string): string {
  const parts = [text.trim(), vibeLabels.join(', ')].filter(Boolean);
  const body = parts.join('. ');
  return (body || place.trim()).slice(0, BODY_MAX);
}

export function placeValid(place: string): boolean {
  const n = place.trim().length;
  return n >= 1 && n <= PLACE_MAX;
}

/** Time left on a check-in: hours and minutes, never negative. */
export function timeLeft(expiresAt: string, now: Date): { h: number; m: number } {
  const ms = Math.max(0, new Date(expiresAt).getTime() - now.getTime());
  const mins = Math.ceil(ms / 60_000);
  return { h: Math.floor(mins / 60), m: mins % 60 };
}

// ---------------------------------------------------------------------------
// New post

export type PostMode = 'text' | 'photo' | 'poll' | 'checkin';

export type PostDraft = {
  mode: PostMode;
  body: string;
  photoPath: string | null;
  photoBusy: boolean;
  options: string[];
  place: string;
};

/** The Post button turns on only when the server would accept the draft. */
export function canPost(d: PostDraft): boolean {
  const body = d.body.trim();
  if (d.mode === 'checkin') {
    return placeValid(d.place) && body.length <= BODY_MAX;
  }
  if (body.length < 1 || body.length > BODY_MAX) return false;
  if (d.mode === 'photo') return !!d.photoPath && !d.photoBusy;
  if (d.mode === 'poll') return pollIssue(d.options) === null;
  return true;
}

/** Thumbnail key next to a full photo key (upload-url names them as a pair). */
export function thumbPath(fullPath: string): string {
  return fullPath.replace(/_full\.webp$/, '_thumb.webp');
}

/** Keyword mute rule (mute_keyword): 2 to 30 characters after trimming. */
export function keywordValid(word: string): boolean {
  const n = word.trim().length;
  return n >= 2 && n <= 30;
}
