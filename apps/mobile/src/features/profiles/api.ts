import type { ReportReason } from '@/components/ReportSheet';
import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';

import type { FeedItem } from '../feed/logic';

export type ClassYear = 'freshman' | 'sophomore' | 'junior' | 'senior' | 'grad' | 'other';

export type Review = {
  id: string;
  thumbs_up: boolean;
  tags: string[];
  comment: string | null;
  rater_name: string | null;
  created_at: string;
};

export type PublicProfile = {
  id: string;
  access: 'ok' | 'me';
  display_name: string | null;
  year: ClassYear | null;
  avatar_path: string | null;
  created_at: string | null;
  founding_seller: boolean;
  swaps_count: number;
  thumbs_up: number;
  thumbs_total: number;
  median_reply_minutes: number | null;
  new_seller: boolean;
  listings: FeedItem[];
  reviews: Review[];
};

export type ProfileResult =
  | PublicProfile
  | { id: string; access: 'blocked'; display_name: string | null }
  | { id: string; access: 'gone' };

/** Seller profile calls (P6-USER-01). */
export type ProfileApi = {
  getProfile: (id: string) => Promise<ProfileResult>;
  block: (id: string) => Promise<void>;
  unblock: (id: string) => Promise<void>;
  reportUser: (id: string, reason: ReportReason, details: string) => Promise<void>;
};

const rpc = createRpc(() => getSupabase() as unknown as RpcClient);

export const profileApi: ProfileApi = {
  getProfile: (id) => rpc<ProfileResult>('get_profile', { user_id: id }),
  block: async (id) => {
    await rpc('block_user', { user_id: id });
  },
  unblock: async (id) => {
    await rpc('unblock_user', { user_id: id });
  },
  reportUser: async (id, reason, details) => {
    await rpc('create_report', {
      target_type: 'user',
      target_id: id,
      reason,
      details: details || null,
    });
  },
};
