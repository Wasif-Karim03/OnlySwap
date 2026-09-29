import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';

import type { Inbox, Offer } from './logic';

/** Offer calls (P7-OFF-01). */
export type OffersApi = {
  make: (
    listingId: string,
    amountCents: number,
    note: string,
    quickNotes: string[],
  ) => Promise<Offer>;
  accept: (offerId: string) => Promise<{ chat_id: string }>;
  counter: (offerId: string, amountCents: number, note?: string) => Promise<Offer>;
  decline: (offerId: string, reason?: string) => Promise<void>;
  withdraw: (offerId: string) => Promise<void>;
  get: (offerId: string) => Promise<Offer>;
  inbox: () => Promise<Inbox>;
  listingOffers: (listingId: string) => Promise<Offer[]>;
};

const rpc = createRpc(() => getSupabase() as unknown as RpcClient);

export const offersApi: OffersApi = {
  make: (listingId, amountCents, note, quickNotes) =>
    rpc<Offer>('make_offer', {
      listing_id: listingId,
      amount_cents: amountCents,
      note: note.trim() || null,
      quick_notes: quickNotes,
    }),
  accept: (offerId) => rpc<{ chat_id: string }>('accept_offer', { offer_id: offerId }),
  counter: (offerId, amountCents, note) =>
    rpc<Offer>('counter_offer', {
      offer_id: offerId,
      amount_cents: amountCents,
      note: note?.trim() || null,
    }),
  decline: async (offerId, reason) => {
    await rpc('decline_offer', { offer_id: offerId, reason: reason ?? null });
  },
  withdraw: async (offerId) => {
    await rpc('withdraw_offer', { offer_id: offerId });
  },
  get: (offerId) => rpc<Offer>('get_offer', { offer_id: offerId }),
  inbox: () => rpc<Inbox>('get_inbox'),
  listingOffers: (listingId) => rpc<Offer[]>('listing_offers', { id: listingId }),
};
