import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

import { useAccountEpoch, watchAccountEpoch } from '@/features/auth/accountEpoch';

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

const epoch = () => useAccountEpoch.getState().epoch;

describe('T-UNIT-AUTH-08 signed-in screens remount for a new session (LR 42)', () => {
  let src: ReturnType<typeof fakeSource>;
  let stop: () => void;
  beforeEach(() => {
    useAccountEpoch.setState({ epoch: 0 });
    src = fakeSource();
    stop = watchAccountEpoch(src.source);
  });
  afterEach(() => stop());

  it('keeps the screens on launch and on token refresh', () => {
    src.emit('INITIAL_SESSION', 'a');
    src.emit('TOKEN_REFRESHED', 'a');
    expect(epoch()).toBe(0);
  });

  it('remounts when the same account signs in again after signing out', () => {
    src.emit('INITIAL_SESSION', 'a');
    src.emit('SIGNED_OUT', null);
    expect(epoch()).toBe(0);
    src.emit('SIGNED_IN', 'a');
    expect(epoch()).toBe(1);
    src.emit('TOKEN_REFRESHED', 'a');
    expect(epoch()).toBe(1);
  });

  it('remounts when another account signs in', () => {
    src.emit('INITIAL_SESSION', 'a');
    src.emit('SIGNED_IN', 'b');
    expect(epoch()).toBe(1);
  });

  it('stops listening when stopped', () => {
    stop();
    expect(src.unsubscribe).toHaveBeenCalled();
  });
});
