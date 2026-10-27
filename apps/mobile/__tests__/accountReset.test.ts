import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { QueryClient } from '@tanstack/react-query';

import { watchAccountReset } from '@/features/auth/accountReset';

// No GC timers, so Jest can exit.
const newClient = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });

type Cb = (event: AuthChangeEvent, session: Session | null) => void;

function fakeSource() {
  let cb: Cb = () => {};
  const unsubscribe = jest.fn();
  return {
    source: {
      onAuthStateChange: (fn: Cb) => {
        cb = fn;
        return { data: { subscription: { unsubscribe } } };
      },
    },
    emit: (event: AuthChangeEvent, userId: string | null) =>
      cb(event, userId ? ({ user: { id: userId } } as unknown as Session) : null),
    unsubscribe,
  };
}

describe('T-UNIT-AUTH-07 account switch clears cached server data (C-03)', () => {
  function setup() {
    const qc = newClient();
    const extra = jest.fn();
    const src = fakeSource();
    const stop = watchAccountReset(src.source, qc, [extra]);
    qc.setQueryData(['me'], { id: 'a' });
    return { qc, extra, src, stop };
  }

  it('clears the query cache and the extra stores on sign-out', () => {
    const { qc, extra, src } = setup();
    src.emit('INITIAL_SESSION', 'a');
    src.emit('SIGNED_OUT', null);
    expect(qc.getQueryData(['me'])).toBeUndefined();
    expect(extra).toHaveBeenCalledTimes(1);
  });

  it('clears when a different account signs in without a sign-out event', () => {
    const { qc, extra, src } = setup();
    src.emit('INITIAL_SESSION', 'a');
    src.emit('SIGNED_IN', 'b');
    expect(qc.getQueryData(['me'])).toBeUndefined();
    expect(extra).toHaveBeenCalledTimes(1);
  });

  it('keeps the cache for the same account (launch, refresh, sign-in again)', () => {
    const { qc, extra, src } = setup();
    src.emit('INITIAL_SESSION', 'a');
    src.emit('TOKEN_REFRESHED', 'a');
    src.emit('SIGNED_IN', 'a');
    src.emit('USER_UPDATED', 'a');
    expect(qc.getQueryData(['me'])).toEqual({ id: 'a' });
    expect(extra).not.toHaveBeenCalled();
  });

  it('a failing extra reset does not stop the others', () => {
    const qc = newClient();
    const bad = jest.fn(() => {
      throw new Error('boom');
    });
    const good = jest.fn();
    const src = fakeSource();
    watchAccountReset(src.source, qc, [bad, good]);
    qc.setQueryData(['me'], { id: 'a' });
    src.emit('SIGNED_OUT', null);
    expect(good).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData(['me'])).toBeUndefined();
  });

  it('returns the unsubscribe', () => {
    const { src, stop } = setup();
    stop();
    expect(src.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
