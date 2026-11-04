import { create } from 'zustand';

import type { SessionSource } from './useSession';

type AccountEpochState = { epoch: number };

/**
 * Bumps each time a session starts after a sign-out or an account switch. The
 * tabs layout keys on it, so every signed-in screen mounts fresh for the new
 * session. On web the tab screens can outlive the sign-out, and Discover kept
 * the last session's deck (LR 42). accountReset drops the cached data; this
 * drops the component state.
 */
export const useAccountEpoch = create<AccountEpochState>(() => ({ epoch: 0 }));

export function watchAccountEpoch(source: Pick<SessionSource, 'onAuthStateChange'>): () => void {
  let last: string | null = null;
  let signedOut = false;
  const { data } = source.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      signedOut = true;
      last = null;
      return;
    }
    const id = session?.user?.id ?? null;
    if (!id) return;
    if (signedOut || (last !== null && id !== last)) {
      useAccountEpoch.setState((s) => ({ epoch: s.epoch + 1 }));
    }
    signedOut = false;
    last = id;
  });
  return () => data.subscription.unsubscribe();
}
