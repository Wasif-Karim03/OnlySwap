import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';

/** my_waitlist_position() (0204): the A09 waitlist and the A10 "campus open" flag. */
export type WaitlistInfo = {
  /** Your place in line; null once you're no longer waiting. */
  position: number | null;
  members: number;
  threshold: number;
  campus: {
    id: string;
    name: string;
    short_name: string;
    slug: string;
    status: 'waitlist' | 'live' | 'paused';
    unlocked_at: string | null;
  } | null;
  invite_code: string | null;
  /** Signups with your invite code. */
  invited: number;
  seen_unlock_at: string | null;
  /** Your campus opened after you joined and you haven't seen A10 yet. */
  show_unlocked: boolean;
};

export type WaitlistApi = {
  position: () => Promise<WaitlistInfo>;
  /** A10 shown (profiles.seen_unlock_at); the first time is kept. */
  markUnlockSeen: () => Promise<void>;
};

const rpc = createRpc(() => getSupabase() as unknown as RpcClient);

export const waitlistApi: WaitlistApi = {
  position: () => rpc<WaitlistInfo>('my_waitlist_position'),
  markUnlockSeen: async () => {
    await rpc('mark_unlock_seen');
  },
};

export const waitlistKey = ['waitlist'] as const;
