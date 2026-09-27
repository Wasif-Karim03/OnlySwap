/**
 * Verify-code rules (S-A04, P4-AUTH-06; T-UNIT-AUTH-05, SECURITY T3).
 * Pure functions over a small per-email state, so the screen and the tests
 * share one source of truth.
 */

export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 5 * 60_000;
export const RESEND_WAIT_MS = 60_000;
/** Codes expire after 600 s (config.toml `otp_expiry`). */
export const CODE_TTL_MS = 600_000;

export type VerifyState = {
  /** When the current code was sent (epoch ms). */
  sentAt: number;
  /** Wrong codes since the last lockout ended. */
  wrong: number;
  /** Set after MAX_ATTEMPTS wrong codes; verifying is refused until then. */
  lockedUntil: number | null;
};

export function initialVerifyState(now: number): VerifyState {
  return { sentAt: now, wrong: 0, lockedUntil: null };
}

export function isLocked(s: VerifyState, now: number): boolean {
  return s.lockedUntil !== null && now < s.lockedUntil;
}

/** Clears an expired lockout (and its count) so a fresh round of tries starts. */
export function settle(s: VerifyState, now: number): VerifyState {
  return s.lockedUntil !== null && now >= s.lockedUntil ? { ...s, wrong: 0, lockedUntil: null } : s;
}

/** The code on screen has outlived its 10 minutes. */
export function isExpired(s: VerifyState, now: number): boolean {
  return now - s.sentAt >= CODE_TTL_MS;
}

/** A rejected code: count it, and lock after the fifth. */
export function recordWrong(s: VerifyState, now: number): VerifyState {
  const wrong = s.wrong + 1;
  return wrong >= MAX_ATTEMPTS ? { ...s, wrong, lockedUntil: now + LOCKOUT_MS } : { ...s, wrong };
}

export function triesLeft(s: VerifyState): number {
  return Math.max(0, MAX_ATTEMPTS - s.wrong);
}

/** A new code was sent. Only the timer restarts; wrong tries and any lockout stay. */
export function recordResend(s: VerifyState, now: number): VerifyState {
  return { ...s, sentAt: now };
}

/** Seconds until "Resend" is available (0 = now). */
export function resendIn(s: VerifyState, now: number): number {
  return Math.max(0, Math.ceil((s.sentAt + RESEND_WAIT_MS - now) / 1000));
}

/** Seconds left in a lockout (0 = not locked). */
export function lockedFor(s: VerifyState, now: number): number {
  return s.lockedUntil === null ? 0 : Math.max(0, Math.ceil((s.lockedUntil - now) / 1000));
}

/** m:ss for the countdowns. */
export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Lives for the app session, keyed by email, so leaving the screen and coming
 * back doesn't reset the lockout. Server limits still apply on top (T3).
 */
const store = new Map<string, VerifyState>();

export const verifyStore = {
  get: (email: string): VerifyState | undefined => store.get(email),
  set: (email: string, s: VerifyState): void => void store.set(email, s),
  clear: (email?: string): void => (email ? void store.delete(email) : store.clear()),
};
