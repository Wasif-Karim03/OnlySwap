import * as StoreReview from 'expo-store-review';

import { createRpc, type RpcClient } from '@/lib/rpc';
import { getStorage } from '@/lib/storage';
import { getSupabase } from '@/lib/supabase';

import {
  shouldAskForReview,
  type DealOutcome,
  type RatingTag,
  type RatingView,
  type ReviewContext,
} from './logic';

/** Deal calls (P8-DEAL-01). */
export type DealsApi = {
  confirm: (chatId: string, outcome: DealOutcome) => Promise<void>;
  rate: (chatId: string, thumbsUp: boolean, tags: RatingTag[], comment: string) => Promise<void>;
  myRating: (chatId: string) => Promise<RatingView>;
  markSold: (listingId: string, buyerId: string | null) => Promise<void>;
};

const rpc = createRpc(() => getSupabase() as unknown as RpcClient);

export const dealsApi: DealsApi = {
  confirm: async (chatId, outcome) => {
    await rpc('confirm_deal', { chat_id: chatId, outcome });
  },
  rate: async (chatId, thumbsUp, tags, comment) => {
    await rpc('submit_rating', {
      chat_id: chatId,
      thumbs_up: thumbsUp,
      tags,
      comment: comment.trim() || null,
    });
  },
  myRating: (chatId) => rpc<RatingView>('get_my_rating', { chat_id: chatId }),
  markSold: async (listingId, buyerId) => {
    await rpc('mark_sold', { id: listingId, buyer_id: buyerId });
  },
};

/**
 * X26: after a good swap, maybe ask for a store review (P8-DEAL-03). The OS
 * decides whether the prompt actually shows; we only ask when the rules hold.
 */
export async function maybeAskForReview(
  ctx: Omit<ReviewContext, 'lastAskedAt'>,
  deps: {
    now?: () => Date;
    lastAsked?: () => string | undefined;
    remember?: (iso: string) => void;
    request?: () => Promise<void>;
    available?: () => Promise<boolean>;
  } = {},
): Promise<boolean> {
  const now = deps.now?.() ?? new Date();
  const last = deps.lastAsked ? deps.lastAsked() : getStorage().get('review.lastAskedAt');
  if (!shouldAskForReview({ ...ctx, lastAskedAt: last ? new Date(last) : null }, now)) return false;
  const available = deps.available ?? (() => StoreReview.hasAction());
  if (!(await available().catch(() => false))) return false;
  (deps.remember ?? ((iso: string) => getStorage().set('review.lastAskedAt', iso)))(
    now.toISOString(),
  );
  await (deps.request ?? (() => StoreReview.requestReview()))().catch(() => {});
  return true;
}
