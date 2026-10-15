import { fill } from '@/lib/format';
import { feed as copy, profileView, sell as sellCopy } from '@/strings';

import { ago, mediaUrl, priceLabel, type AnyListingKind, type Condition } from '../sell/logic';
import type { SwipeDir } from './deckMath';
import type { DeckCard } from './SwipeCard';

/** One card from `get_feed` / `get_listing` (private.feed_item, API §3). */
export type FeedItem = {
  id: string;
  /** food and wanted only come from get_listing and get_campus_feed (R1.1). */
  kind: AnyListingKind;
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
  /** Likes and comments (DEC 121, 0233); optional so older cached cards still parse. */
  like_count?: number;
  comment_count?: number;
  comments_enabled?: boolean;
  liked?: boolean;
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
    /** Seller stats (DEC 124, 0235); optional so older cached cards still parse. */
    swaps_count?: number;
    thumbs_up?: number;
    thumbs_total?: number;
  };
  photos: {
    path: string;
    thumb_path: string;
    blurhash: string | null;
    width: number | null;
    height: number | null;
  }[];
  /** Only on the seller's own listing when an admin removed it (DEC 96). */
  removed_reason?: string | null;
  /** News posts (DEC 98): an optional link and event time. */
  link_url?: string | null;
  event_at?: string | null;
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

/** "Junior" for a known class year; nothing for an unknown or missing one. */
export function yearLabel(year: string | null | undefined): string | null {
  if (!year) return null;
  const years: Record<string, string> = profileView.years;
  return years[year] ?? null;
}

/** Ratings needed before a percentage shows; one bad rating shouldn't read as "0%". */
export const TRUST_MIN_RATINGS = 3;

/**
 * "Verified student · 95% thumbs up" (DEC 124). Every account is a verified
 * student; the stat is the percentage once rated enough, else the swaps.
 */
export function trustLine(seller: FeedItem['seller']): string {
  const up = seller.thumbs_up ?? 0;
  const total = seller.thumbs_total ?? 0;
  const swaps = seller.swaps_count ?? 0;
  const stat =
    total >= TRUST_MIN_RATINGS
      ? fill(copy.trustThumbs, { pct: Math.round((up / total) * 100) })
      : swaps === 1
        ? copy.trustSwapsOne
        : swaps > 1
          ? fill(copy.trustSwaps, { n: swaps })
          : null;
  return [copy.verified, stat].filter(Boolean).join(copy.metaSeparator);
}

export function toDeckCard(item: FeedItem, mediaBase: string, now: Date): DeckCard {
  return {
    id: item.id,
    title: item.title,
    price: priceLabel(item.kind, item.price_cents, copy.free),
    meta: metaLine(item, now),
    sellerName: sellerName(item),
    sellerAvatar: item.seller.avatar_path ? mediaUrl(mediaBase, item.seller.avatar_path) : null,
    sellerYear: yearLabel(item.seller.year),
    trust: trustLine(item.seller),
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

/** `dwell_ms` is time on card (E-03, DEC 100); the server keeps it on the swipe. */
export type QueuedSwipe = { listing_id: string; dir: SwipeDir; at: string; dwell_ms?: number };
/** A right swipe opens the offer sheet and is stored as `right` (DEC 106; it was `left`, which inflated pass counts). */
export type ServerSwipe = {
  listing_id: string;
  dir: SwipeDir;
  at: string;
  dwell_ms?: number;
};

export const FLUSH_AT = 10;
export const QUEUE_CAP = 200;
export const BATCH_MAX = 50;
export const UNDO_MS = 5000;
/** Same cap as the server (10 minutes). */
export const DWELL_MAX = 600_000;

/** Time on card as whole ms in 0..10 min, or undefined when unknown. */
export function cleanDwell(ms: unknown): number | undefined {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return undefined;
  return Math.min(Math.round(ms), DWELL_MAX);
}

export function toServer(s: QueuedSwipe): ServerSwipe {
  const out: ServerSwipe = {
    listing_id: s.listing_id,
    dir: s.dir,
    at: s.at,
  };
  if (s.dwell_ms !== undefined) out.dwell_ms = s.dwell_ms;
  return out;
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
    .map((q) => {
      const s: QueuedSwipe = { listing_id: q.listing_id, dir: q.dir, at: q.at };
      const dwell = cleanDwell(q.dwell_ms);
      if (dwell !== undefined) s.dwell_ms = dwell;
      return s;
    })
    .slice(-QUEUE_CAP);
}
