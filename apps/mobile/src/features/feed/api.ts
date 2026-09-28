import type { ReportReason } from '@/components/ReportSheet';
import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';

import type { FeedCursor, FeedItem, ListingResult, ServerSwipe } from './logic';

/**
 * Feed and listing calls (P6-FEED-01, P6-LIST-01/02). `feedApi` is the app's
 * instance; screens take an injected one in tests.
 */
export type FeedApi = {
  getFeed: (cursor: FeedCursor | null, limit: number) => Promise<FeedItem[]>;
  recordSwipes: (items: ServerSwipe[]) => Promise<void>;
  undoSwipe: (listingId: string) => Promise<void>;
  save: (listingId: string) => Promise<number>;
  unsave: (listingId: string) => Promise<number>;
  hide: (listingId: string) => Promise<void>;
  watch: (listingId: string) => Promise<void>;
  recordView: (listingId: string) => Promise<void>;
  getListing: (id: string) => Promise<ListingResult>;
  reportListing: (id: string, reason: ReportReason, details: string) => Promise<void>;
};

const rpc = createRpc(() => getSupabase() as unknown as RpcClient);

export const feedApi: FeedApi = {
  getFeed: (cursor, limit) => rpc<FeedItem[]>('get_feed', { cursor, limit }),
  recordSwipes: async (items) => {
    await rpc('record_swipes', { items });
  },
  undoSwipe: async (listingId) => {
    await rpc('undo_swipe', { listing_id: listingId });
  },
  save: async (listingId) =>
    (await rpc<{ save_count: number }>('save_listing', { listing_id: listingId })).save_count,
  unsave: async (listingId) =>
    (await rpc<{ save_count: number }>('unsave_listing', { listing_id: listingId })).save_count,
  hide: async (listingId) => {
    await rpc('hide_listing', { listing_id: listingId });
  },
  watch: async (listingId) => {
    await rpc('watch_listing', { listing_id: listingId });
  },
  recordView: async (listingId) => {
    await rpc('record_view', { listing_id: listingId });
  },
  getListing: (id) => rpc<ListingResult>('get_listing', { id }),
  reportListing: async (id, reason, details) => {
    await rpc('create_report', {
      target_type: 'listing',
      target_id: id,
      reason,
      details: details || null,
    });
  },
};
