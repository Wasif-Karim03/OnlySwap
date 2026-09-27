import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { getSupabase } from '@/lib/supabase';

export type SessionState =
  | { status: 'loading'; session: null }
  | { status: 'signedOut'; session: null }
  | { status: 'signedIn'; session: Session };

/** What useSession needs from supabase-js auth, so tests can pass a fake. */
export type SessionSource = {
  getSession: () => Promise<{ data: { session: Session | null } }>;
  onAuthStateChange: (cb: (event: AuthChangeEvent, session: Session | null) => void) => {
    data: { subscription: { unsubscribe: () => void } };
  };
};

function toState(session: Session | null): SessionState {
  return session ? { status: 'signedIn', session } : { status: 'signedOut', session: null };
}

/** The current session, restored from SecureStore on launch and kept in sync. */
export function useSession(source?: SessionSource): SessionState {
  const [state, setState] = useState<SessionState>({ status: 'loading', session: null });

  useEffect(() => {
    const auth = source ?? getSupabase().auth;
    let alive = true;
    auth
      .getSession()
      .then(({ data }) => {
        if (alive) setState((prev) => (prev.status === 'loading' ? toState(data.session) : prev));
      })
      .catch(() => {
        if (alive) setState((prev) => (prev.status === 'loading' ? toState(null) : prev));
      });
    const { data } = auth.onAuthStateChange((_event, session) => {
      if (alive) setState(toState(session));
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [source]);

  return state;
}
