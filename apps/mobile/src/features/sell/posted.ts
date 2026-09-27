import { create } from 'zustand';

import type { PostedListing } from './api';

/**
 * The listing just posted, handed from step 3 to the Posted screen (D04).
 * The draft is cleared on posting, so the local cover photo travels here too
 * (the share card renders from it without a download).
 */
export type PostedState = {
  listing: PostedListing | null;
  coverUri: string | null;
  set: (listing: PostedListing, coverUri: string | null) => void;
  clear: () => void;
};

export const usePostedStore = create<PostedState>((set) => ({
  listing: null,
  coverUri: null,
  set: (listing, coverUri) => set({ listing, coverUri }),
  clear: () => set({ listing: null, coverUri: null }),
}));
