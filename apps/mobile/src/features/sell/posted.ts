import { create } from 'zustand';

import type { PostedListing } from './api';
import type { SellDraft } from './logic';

/** What "List another" keeps from the last post (DEC 133). */
export type DraftCarry = Pick<SellDraft, 'spotIds' | 'meetNote' | 'availability' | 'pickupBy'>;

export function draftCarry(d: SellDraft): DraftCarry {
  return {
    spotIds: d.spotIds,
    meetNote: d.meetNote,
    availability: d.availability,
    pickupBy: d.pickupBy,
  };
}

/**
 * The listing just posted, handed from step 3 to the Posted screen (D04).
 * The draft is cleared on posting, so the local cover photo travels here too
 * (the share card renders from it without a download).
 */
export type PostedState = {
  listing: PostedListing | null;
  coverUri: string | null;
  carry: DraftCarry | null;
  set: (listing: PostedListing, coverUri: string | null, carry?: DraftCarry | null) => void;
  clear: () => void;
};

export const usePostedStore = create<PostedState>((set) => ({
  listing: null,
  coverUri: null,
  carry: null,
  set: (listing, coverUri, carry = null) => set({ listing, coverUri, carry }),
  clear: () => set({ listing: null, coverUri: null, carry: null }),
}));
