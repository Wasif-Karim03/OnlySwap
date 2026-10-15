import type { QueryClient } from '@tanstack/react-query';

import type { SessionSource } from './useSession';

/**
 * Account switch (audit C-03). Server data is cached per process: the query
 * cache, chat stores and the pending swipe queue. When the person signs out,
 * or another account signs in on the same phone, all of it is dropped so the
 * next account never sees the last one's profile, inbox or chats, and never
 * sends their swipes.
 */
export function watchAccountReset(
  source: Pick<SessionSource, 'onAuthStateChange'>,
  queryClient: QueryClient,
  extras: (() => void)[] = [],
): () => void {
  let last: string | null = null;
  const reset = () => {
    queryClient.clear();
    for (const fn of extras) {
      try {
        fn();
      } catch {
        // One store failing to reset must not keep the others.
      }
    }
  };
  const { data } = source.onAuthStateChange((event, session) => {
    const id = session?.user?.id ?? null;
    if (event === 'SIGNED_OUT') {
      reset();
      last = null;
      return;
    }
    if (id && last && id !== last) reset();
    if (id) last = id;
  });
  return () => data.subscription.unsubscribe();
}
