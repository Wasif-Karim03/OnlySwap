import { fill } from '@/lib/format';
import { feed as copy, sell as sellCopy } from '@/strings/en';

import { ago, mediaUrl, priceLabel, type Condition, type ListingKind } from '../sell/logic';
import type { SwipeDir } from './deckMath';
import type { DeckCard } from './SwipeCard';

/** One card from `get_feed` / `get_listing` (private.feed_item, API §3). */
export type FeedItem = {
  id: string;
  kind: ListingKind;
  status: 'active' | 'hold' | 'sold' | 'expired' | 'held_review' | 'removed';
  title: string;
  description: string | null;
  price_cents: number;
  condition: Condition | null;
  category_id: number | null;
  open_to_offers: boolean;
  meet_spot_ids: string[];
  meet_note: string | null;
  availability: string[];
  save_count: number;
  view_count: number;
  offer_count: number;
  bumped_at: string;
  created_at: string;
  expires_at: string | null;
  is_own: boolean;
  saved: boolean;
  watching: boolean;
  seller: {
    id: string | null;
    display_name: string | null;
    avatar_path: string | null;
    year: string | null;
    created_at: string | null;
  };
  photos: {
    path: string;
    thumb_path: string;
    blurhash: string | null;
    width: number | null;
    height: number | null;
  }[];
};

export type FeedCursor = { bumped_at: string; id: string };

export type ListingAccess = 'buyer' | 'owner' | 'gone' | 'blocked' | 'other_campus';
export type ListingResult =
  | (FeedItem & { access: 'buyer' | 'owner' })
  | { id: string; access: 'gone' | 'blocked' | 'other_campus' };

export function isVisible(r: ListingResult): r is FeedItem & { access: 'buyer' | 'owner' } {
  return r.access === 'buyer' || r.access === 'owner';
}

/** Next page cursor: the last card of a full page, else none (end of deck). */
export function nextCursor(page: FeedItem[], limit: number): FeedCursor | null {
  const last = page[page.length - 1];
  if (!last || page.length < limit) return null;
  return { bumped_at: last.bumped_at, id: last.id };
}

export function agoLabel(then: Date, now: Date): string {
  const a = ago(then, now);
  const t = sellCopy.ago[a.key];
  return 'n' in a ? fill(t, { n: a.n }) : t;
}

export function metaLine(item: Pick<FeedItem, 'condition' | 'bumped_at'>, now: Date): string {
  const parts = [
    item.condition ? sellCopy.conditions[item.condition] : null,
    agoLabel(new Date(item.bumped_at), now),
  ].filter(Boolean);
  return parts.join(copy.metaSeparator);
}

export function sellerName(item: Pick<FeedItem, 'seller'>): string {
  return item.seller.display_name ?? '';
}

export function toDeckCard(item: FeedItem, mediaBase: string, now: Date): DeckCard {
  return {
    id: item.id,
    title: item.title,
    price: priceLabel(item.kind, item.price_cents, copy.free),
    meta: metaLine(item, now),
    sellerName: sellerName(item),
    sellerAvatar: item.seller.avatar_path ? mediaUrl(mediaBase, item.seller.avatar_path) : null,
    photos: item.photos.map((p) => ({ uri: mediaUrl(mediaBase, p.path), blurhash: p.blurhash })),
    saveCount: item.save_count,
  };
}

/** Appends a page, dropping cards already in the deck or already swiped. */
export function mergePage(deck: FeedItem[], page: FeedItem[], swiped: Set<string>): FeedItem[] {
  const have = new Set(deck.map((d) => d.id));
  return [...deck, ...page.filter((p) => !have.has(p.id) && !swiped.has(p.id))];
}

/** Fewer than 10 listings on the whole campus feed: the day-one hero (DESIGN_SYSTEM B01). */
export const DAY_ONE_MAX = 10;

// ---------------------------------------------------------------------------
// Swipe queue (T-UNIT-FEED-01)

export type QueuedSwipe = { listing_id: string; dir: SwipeDir; at: string };
/** The server keeps `left` and `save`; a right swipe opens the offer sheet and is recorded as seen (left). */
export type ServerSwipe = { listing_id: string; dir: 'left' | 'save'; at: string };

export const FLUSH_AT = 10;
export const QUEUE_CAP = 200;
export const BATCH_MAX = 50;
export const UNDO_MS = 5000;

export function toServer(s: QueuedSwipe): ServerSwipe {
  return { listing_id: s.listing_id, dir: s.dir === 'save' ? 'save' : 'left', at: s.at };
}

/** Adds a swipe (replacing an older one for the same listing) and keeps the newest 200. */
export function enqueue(queue: QueuedSwipe[], s: QueuedSwipe): QueuedSwipe[] {
  const next = [...queue.filter((q) => q.listing_id !== s.listing_id), s];
  return next.length > QUEUE_CAP ? next.slice(next.length - QUEUE_CAP) : next;
}

export function shouldFlush(queue: QueuedSwipe[]): boolean {
  return queue.length >= FLUSH_AT;
}

/** Undo: within 5 s of the swipe. Pending swipes are just dropped; sent ones need `undo_swipe`. */
export function undoPlan(
  queue: QueuedSwipe[],
  last: QueuedSwipe | null,
  now: Date,
): { kind: 'expired' } | { kind: 'local'; queue: QueuedSwipe[] } | { kind: 'server' } {
  if (!last || now.getTime() - new Date(last.at).getTime() > UNDO_MS) return { kind: 'expired' };
  if (queue.some((q) => q.listing_id === last.listing_id)) {
    return { kind: 'local', queue: queue.filter((q) => q.listing_id !== last.listing_id) };
  }
  return { kind: 'server' };
}

/** Parses the stored queue, keeping only well-formed entries. */
export function parseQueue(raw: unknown): QueuedSwipe[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (q): q is QueuedSwipe =>
        !!q &&
        typeof q === 'object' &&
        typeof (q as QueuedSwipe).listing_id === 'string' &&
        ['left', 'right', 'save'].includes((q as QueuedSwipe).dir) &&
        typeof (q as QueuedSwipe).at === 'string',
    )
    .slice(-QUEUE_CAP);
}
