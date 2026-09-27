import { create } from 'zustand';

import type { SessionSource } from './useSession';

/**
 * X7 Session expired (P4-AUTH-14). When the session ends without the person
 * asking (the refresh token was revoked by "Sign out of all devices", a
 * suspension, or it simply expired), a sheet asks for a new code over the
 * current screen instead of throwing them back to the start.
 */
type State = {
  open: boolean;
  email: string | null;
  show: (email: string) => void;
  hide: () => void;
};

export const useSessionExpiry = create<State>((set) => ({
  open: false,
  email: null,
  show: (email) => set({ open: true, email }),
  hide: () => set({ open: false }),
}));

let intentional = false;
let lastEmail: string | null = null;

/** Call right before a sign-out the person asked for, so no sheet appears. */
export function noteIntentionalSignOut(): void {
  intentional = true;
}

/** Test helper: forget what the watcher has seen. */
export function resetSessionExpiry(): void {
  intentional = false;
  lastEmail = null;
  useSessionExpiry.setState({ open: false, email: null });
}

/** Watches auth events for the app's lifetime; returns the unsubscribe. */
export function watchSessionExpiry(source: Pick<SessionSource, 'onAuthStateChange'>): () => void {
  const { data } = source.onAuthStateChange((event, session) => {
    const email = (session as { user?: { email?: string } } | null)?.user?.email;
    if (email) lastEmail = email;
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      intentional = false;
      return;
    }
    if (event !== 'SIGNED_OUT') return;
    if (intentional || !lastEmail) {
      intentional = false;
      lastEmail = null;
      return;
    }
    useSessionExpiry.getState().show(lastEmail);
  });
  return () => data.subscription.unsubscribe();
}
