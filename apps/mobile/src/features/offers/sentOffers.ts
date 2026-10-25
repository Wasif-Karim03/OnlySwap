/**
 * Listings the buyer sent an offer on in this session. Discover holds a
 * right-swiped card until the offer sheet closes, then asks here whether the
 * offer went out: sent, the swipe is recorded; not sent, the card comes back
 * (UX audit 2026-10-25: a sloppy flick used to lose the item for 30 days).
 */
const sent = new Set<string>();

export function markOfferSent(listingId: string): void {
  sent.add(listingId);
}

/** True once if an offer went out for this listing; clears it. */
export function takeOfferSent(listingId: string): boolean {
  return sent.delete(listingId);
}
