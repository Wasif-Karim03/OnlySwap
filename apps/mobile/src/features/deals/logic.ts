export type DealOutcome = 'done' | 'not_yet' | 'fell_through';
export type RatingTag =
  | 'on_time'
  | 'as_described'
  | 'friendly'
  | 'easy'
  | 'late'
  | 'not_as_described'
  | 'rude'
  | 'no_show';

export const GOOD_TAGS: RatingTag[] = ['on_time', 'as_described', 'friendly', 'easy'];
export const BAD_TAGS: RatingTag[] = ['late', 'not_as_described', 'rude', 'no_show'];

export type RatingView = {
  mine: { thumbs_up: boolean; tags: RatingTag[]; comment: string | null } | null;
  theirs: { thumbs_up: boolean; tags: RatingTag[]; comment: string | null } | null;
  theirs_waiting: boolean;
};

/** Rate screen phase (E17 submit, E18 waiting / revealed). */
export function ratePhase(r: RatingView | undefined): 'submit' | 'waiting' | 'revealed' {
  if (!r?.mine) return 'submit';
  return r.theirs ? 'revealed' : 'waiting';
}

// ---------------------------------------------------------------------------
// X26 Rate the app (P8-DEAL-03, T-UNIT-DEAL-01)

export type ReviewContext = {
  /** Finished swaps on this account. */
  swaps: number;
  accountCreatedAt: Date;
  lastAskedAt: Date | null;
  /** How the swap that just ended went. */
  lastOutcome: 'done' | 'fell_through' | 'no_show';
};

const DAY = 86_400_000;

/** Ask only after ≥3 swaps, 14 days in, 120 days since the last ask, and never after a bad ending. */
export function shouldAskForReview(c: ReviewContext, now: Date): boolean {
  if (c.lastOutcome !== 'done') return false;
  if (c.swaps < 3) return false;
  if (now.getTime() - c.accountCreatedAt.getTime() < 14 * DAY) return false;
  if (c.lastAskedAt && now.getTime() - c.lastAskedAt.getTime() < 120 * DAY) return false;
  return true;
}
