import {
  CODE_TTL_MS,
  formatCountdown,
  initialVerifyState,
  isExpired,
  isLocked,
  lockedFor,
  LOCKOUT_MS,
  MAX_ATTEMPTS,
  recordResend,
  recordWrong,
  RESEND_WAIT_MS,
  resendIn,
  settle,
  triesLeft,
  verifyStore,
} from '../src/features/auth/verifyLogic';

const T0 = 1_800_000_000_000;

describe('T-UNIT-AUTH-05 verify code attempt counter', () => {
  it('counts down tries and locks for 5 minutes after the fifth wrong code', () => {
    let s = initialVerifyState(T0);
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      s = recordWrong(s, T0);
      expect(triesLeft(s)).toBe(MAX_ATTEMPTS - i);
      expect(isLocked(s, T0)).toBe(false);
    }
    s = recordWrong(s, T0);
    expect(isLocked(s, T0)).toBe(true);
    expect(lockedFor(s, T0)).toBe(300);
    expect(isLocked(s, T0 + LOCKOUT_MS - 1)).toBe(true);
    expect(isLocked(s, T0 + LOCKOUT_MS)).toBe(false);
  });

  it('resend resets the timer only: tries and the lockout stay', () => {
    let s = initialVerifyState(T0);
    for (let i = 0; i < MAX_ATTEMPTS; i++) s = recordWrong(s, T0);
    const resent = recordResend(s, T0 + 60_000);
    expect(resent.sentAt).toBe(T0 + 60_000);
    expect(resent.wrong).toBe(MAX_ATTEMPTS);
    expect(isLocked(resent, T0 + 60_000)).toBe(true);
  });

  it('a finished lockout starts a fresh round of tries', () => {
    let s = initialVerifyState(T0);
    for (let i = 0; i < MAX_ATTEMPTS; i++) s = recordWrong(s, T0);
    const after = settle(s, T0 + LOCKOUT_MS);
    expect(after.wrong).toBe(0);
    expect(after.lockedUntil).toBeNull();
    expect(settle(s, T0 + 1)).toBe(s);
  });

  it('resend waits 60 seconds after each send', () => {
    const s = initialVerifyState(T0);
    expect(resendIn(s, T0)).toBe(60);
    expect(resendIn(s, T0 + 59_001)).toBe(1);
    expect(resendIn(s, T0 + RESEND_WAIT_MS)).toBe(0);
  });

  it('codes expire after 10 minutes', () => {
    const s = initialVerifyState(T0);
    expect(isExpired(s, T0 + CODE_TTL_MS - 1)).toBe(false);
    expect(isExpired(s, T0 + CODE_TTL_MS)).toBe(true);
    expect(isExpired(recordResend(s, T0 + CODE_TTL_MS), T0 + CODE_TTL_MS)).toBe(false);
  });

  it('formats countdowns as m:ss', () => {
    expect(formatCountdown(42)).toBe('0:42');
    expect(formatCountdown(300)).toBe('5:00');
    expect(formatCountdown(61)).toBe('1:01');
  });

  it('the store keeps state per email across screen visits', () => {
    verifyStore.clear();
    verifyStore.set('a@osu.edu', recordWrong(initialVerifyState(T0), T0));
    expect(verifyStore.get('a@osu.edu')?.wrong).toBe(1);
    expect(verifyStore.get('b@osu.edu')).toBeUndefined();
    verifyStore.clear('a@osu.edu');
    expect(verifyStore.get('a@osu.edu')).toBeUndefined();
  });
});
