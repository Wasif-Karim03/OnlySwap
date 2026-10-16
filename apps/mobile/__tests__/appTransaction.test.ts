import {
  linkAppTransaction,
  resetAppTransactionLinks,
  startAppTransactionLink,
} from '../src/features/auth/appTransaction';

const native = (id: string | null = '704289572311552426') => ({
  getAppTransactionIdAsync: jest.fn(async () => id),
});

beforeEach(() => resetAppTransactionLinks());

describe('T-UNIT-CONSENT AR-04 linkAppTransaction', () => {
  it('links once per user per launch', async () => {
    const n = native();
    const link = jest.fn(async () => {});
    expect(await linkAppTransaction(n, link, 'u1', 'ios')).toBe('linked');
    expect(link).toHaveBeenCalledWith('704289572311552426');
    expect(await linkAppTransaction(n, link, 'u1', 'ios')).toBe('skipped');
    expect(await linkAppTransaction(n, link, 'u2', 'ios')).toBe('linked');
    expect(link).toHaveBeenCalledTimes(2);
  });

  it('skips Android, a missing module and a missing id', async () => {
    const link = jest.fn(async () => {});
    expect(await linkAppTransaction(native(), link, 'u1', 'android')).toBe('skipped');
    expect(await linkAppTransaction(null, link, 'u1', 'ios')).toBe('skipped');
    expect(await linkAppTransaction(native(null), link, 'u1', 'ios')).toBe('skipped');
    expect(link).not.toHaveBeenCalled();
  });

  it('a failure is quiet and retried later', async () => {
    const link = jest
      .fn<Promise<void>, [string]>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    expect(await linkAppTransaction(native(), link, 'u1', 'ios')).toBe('failed');
    expect(await linkAppTransaction(native(), link, 'u1', 'ios')).toBe('linked');
  });
});

describe('T-UNIT-CONSENT AR-04 startAppTransactionLink', () => {
  function fakeAuth() {
    let cb: ((event: string, session: { user?: { id: string } } | null) => void) | null = null;
    const unsubscribe = jest.fn();
    return {
      auth: {
        onAuthStateChange: (fn: NonNullable<typeof cb>) => {
          cb = fn;
          return { data: { subscription: { unsubscribe } } };
        },
      },
      emit: (event: string, userId: string | null) =>
        cb?.(event, userId ? { user: { id: userId } } : null),
      unsubscribe,
    };
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('links after sign-in and the restored session, outside the callback', async () => {
    const f = fakeAuth();
    const link = jest.fn(async () => {});
    const stop = startAppTransactionLink(f.auth, native(), link, 'ios');
    f.emit('INITIAL_SESSION', 'u1');
    expect(link).not.toHaveBeenCalled();
    await jest.runAllTimersAsync();
    expect(link).toHaveBeenCalledTimes(1);
    f.emit('TOKEN_REFRESHED', 'u2');
    f.emit('SIGNED_OUT', null);
    await jest.runAllTimersAsync();
    expect(link).toHaveBeenCalledTimes(1);
    stop();
    expect(f.unsubscribe).toHaveBeenCalled();
  });

  it('does nothing off iOS', () => {
    const f = fakeAuth();
    const spy = jest.spyOn(f.auth, 'onAuthStateChange');
    startAppTransactionLink(f.auth, native(), jest.fn(), 'android')();
    expect(spy).not.toHaveBeenCalled();
  });
});
