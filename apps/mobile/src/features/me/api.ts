import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';

import type { FeedItem } from '../feed/logic';
import type { ClassYear } from '../profiles/api';

export type Me = {
  id: string;
  first_name: string | null;
  last_initial: string | null;
  display_name: string | null;
  year: ClassYear | null;
  bio: string | null;
  avatar_path: string | null;
  status: string;
  verified_until: string;
  created_at: string;
  founding_seller: boolean;
  campus: { id: string; name: string; short_name: string; timezone: string } | null;
  analytics_opt_in: boolean;
  crash_reports_opt_in: boolean;
  theme_mode: 'system' | 'light' | 'dark';
  counts: {
    active: number;
    sold: number;
    saved: number;
    swaps: number;
    thumbs_up: number;
    thumbs_total: number;
  };
};

export type MyListing = FeedItem & { can_relist: boolean };

export type ListingStats = {
  views: number;
  saves: number;
  offers: number;
  open_offers: number;
  best_offer_cents: number | null;
  created_at: string;
  bumped_at: string;
  expires_at: string | null;
  price_changes: { old: number; new: number; at: string }[];
};

export type ProfileInput = {
  firstName: string;
  lastInitial: string | null;
  year: ClassYear | null;
  bio: string | null;
  avatarPath: string | null;
};

export type ListingPatch = {
  title?: string;
  description?: string;
  price_cents?: number;
  open_to_offers?: boolean;
};

/** Profile and settings calls (P11-SET-01/02). */
export type MeApi = {
  me: () => Promise<Me>;
  listings: () => Promise<MyListing[]>;
  stats: (listingId: string) => Promise<ListingStats>;
  updateProfile: (p: ProfileInput) => Promise<void>;
  updateFlags: (f: {
    analytics_opt_in?: boolean;
    crash_reports_opt_in?: boolean;
    theme_mode?: string;
  }) => Promise<void>;
  updateListing: (id: string, patch: ListingPatch) => Promise<void>;
  deleteListing: (id: string) => Promise<void>;
  relist: (id: string, priceCents: number | null) => Promise<void>;
};

const rpc = createRpc(() => getSupabase() as unknown as RpcClient);

export const meApi: MeApi = {
  me: () => rpc<Me>('get_me'),
  listings: () => rpc<MyListing[]>('my_listings'),
  stats: (id) => rpc<ListingStats>('listing_stats', { id }),
  updateProfile: async (p) => {
    await rpc('update_profile', {
      first_name: p.firstName.trim(),
      last_initial: p.lastInitial?.trim() || null,
      year: p.year,
      bio: p.bio?.trim() || null,
      avatar_path: p.avatarPath,
    });
  },
  updateFlags: async (f) => {
    await rpc('update_profile_flags', {
      analytics_opt_in: f.analytics_opt_in ?? null,
      crash_reports_opt_in: f.crash_reports_opt_in ?? null,
      theme_mode: f.theme_mode ?? null,
    });
  },
  updateListing: async (id, patch) => {
    await rpc('update_listing', { id, ...patch });
  },
  deleteListing: async (id) => {
    await rpc('delete_listing', { id });
  },
  relist: async (id, priceCents) => {
    await rpc('relist_listing', { id, price_cents: priceCents });
  },
};

/** F03 tabs: Active (active + hold), Sold, Other (expired, in review, removed). */
export function listingTab(status: string): 'active' | 'sold' | 'other' {
  if (status === 'active' || status === 'hold') return 'active';
  if (status === 'sold') return 'sold';
  return 'other';
}
