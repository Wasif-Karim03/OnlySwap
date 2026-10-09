import { fill, money as formatMoney } from '@/lib/format';
import { offers as copy } from '@/strings';

export type OfferStatus =
  'pending' | 'countered' | 'accepted' | 'declined' | 'expired' | 'withdrawn' | 'auto_declined';
export type Role = 'buyer' | 'seller';

/** One offer from `get_offer` / `get_inbox` / `listing_offers` (private.offer_json). */
export type Offer = {
  id: string;
  listing_id: string | null;
  amount_cents: number;
  note: string | null;
  quick_notes: string[];
  status: OfferStatus;
  round: number;
  last_actor: Role;
  decline_reason: string | null;
  expires_at: string;
  responded_at: string | null;
  created_at: string;
  role: Role;
  chat_id: string | null;
  listing: {
    id: string;
    title: string;
    price_cents: number;
    kind: 'sale' | 'free';
    status: string;
    thumb_path: string | null;
  } | null;
  other: { id: string; display_name: string | null; avatar_path: string | null } | null;
};

export type ChatSummary = {
  id: string;
  listing_id: string | null;
  offer_id: string | null;
  status: 'open' | 'closed' | 'blocked';
  listing_title: string;
  listing_price_cents: number;
  listing_thumb_path: string | null;
  agreed_cents: number;
  role: Role;
  last_message_at: string;
  muted: boolean;
  unread: boolean;
  last_message: { kind: string; body: string | null; mine: boolean; created_at: string } | null;
  other: { id: string; display_name: string | null; avatar_path: string | null } | null;
};

export type Inbox = { incoming: Offer[]; outgoing: Offer[]; chats: ChatSummary[] };

// ---------------------------------------------------------------------------
// Offer sheet (T-UNIT-OFF-01)

export const MAX_ROUND = 4;

const roundDollar = (cents: number) => Math.max(100, Math.round(cents / 100) * 100);

/** Quick amounts: the ask, 10% less and 20% less, rounded to whole dollars, no repeats. */
export function quickAmounts(askCents: number): { cents: number; label: 'ask' | 10 | 20 }[] {
  if (askCents <= 0) return [];
  const out: { cents: number; label: 'ask' | 10 | 20 }[] = [{ cents: askCents, label: 'ask' }];
  for (const pct of [10, 20] as const) {
    const cents = roundDollar(askCents * (1 - pct / 100));
    if (!out.some((o) => o.cents === cents) && cents < askCents) out.push({ cents, label: pct });
  }
  return out;
}

/** Warn under half the asking price. */
export function isLowOffer(amountCents: number, askCents: number): boolean {
  return askCents > 0 && amountCents > 0 && amountCents < askCents / 2;
}

/** "$35" or "$35.50" for display. */
export function money(cents: number): string {
  return formatMoney(cents);
}

// ---------------------------------------------------------------------------
// Offer screen state (T-UNIT-OFF-02)

export type OfferAction =
  'accept' | 'counter' | 'decline' | 'withdraw' | 'open_chat' | 'offer_again';
export type OfferView = {
  /** Which board frame this is (E3-E8). */
  frame: 'E3' | 'E4' | 'E5' | 'E6' | 'E7' | 'E8';
  line: string;
  actions: OfferAction[];
  open: boolean;
};

const isOpen = (s: OfferStatus) => s === 'pending' || s === 'countered';

/** Every status × role pair → what the offer screen shows and allows. */
export function offerView(
  o: Pick<
    Offer,
    'status' | 'role' | 'last_actor' | 'round' | 'amount_cents' | 'chat_id' | 'other' | 'listing'
  >,
): OfferView {
  const name = o.other?.display_name ?? copy.deletedUser;
  const amount = money(o.amount_cents);
  const myTurn = isOpen(o.status) && o.role !== o.last_actor;
  const canCounter = o.round < MAX_ROUND && o.listing?.kind !== 'free';

  if (isOpen(o.status)) {
    if (myTurn) {
      const line =
        o.status === 'pending'
          ? fill(copy.status.pending_seller, { name, amount })
          : fill(copy.status.countered_mine, { name, amount });
      const actions: OfferAction[] = [
        'accept',
        ...(canCounter ? (['counter'] as const) : []),
        'decline',
      ];
      if (o.role === 'buyer') actions.push('withdraw');
      return { frame: o.status === 'pending' ? 'E3' : 'E4', line, actions, open: true };
    }
    const line =
      o.status === 'pending'
        ? fill(copy.status.pending_buyer, { name, amount })
        : fill(copy.status.countered_theirs, { name, amount });
    return { frame: 'E5', line, actions: o.role === 'buyer' ? ['withdraw'] : [], open: true };
  }
  switch (o.status) {
    case 'accepted':
      return {
        frame: 'E6',
        line: fill(copy.status.accepted, { amount }),
        actions: o.chat_id ? ['open_chat'] : [],
        open: false,
      };
    case 'auto_declined':
      return {
        frame: 'E8',
        line: o.listing?.status === 'hold' ? copy.status.hold_other : copy.status.auto_declined,
        actions: [],
        open: false,
      };
    default: {
      const again =
        o.role === 'buyer' && o.listing?.status === 'active' ? (['offer_again'] as const) : [];
      return { frame: 'E7', line: copy.status[o.status], actions: [...again], open: false };
    }
  }
}

/** Inbox sections: my turn first, then theirs, then closed in the last week. */
export function inboxSections(inbox: Pick<Inbox, 'incoming' | 'outgoing'>) {
  const all = [...inbox.incoming, ...inbox.outgoing];
  const mine = all.filter((o) => isOpen(o.status) && o.role !== o.last_actor);
  const toYou = inbox.incoming.filter((o) => isOpen(o.status) && o.role === o.last_actor);
  const youMade = inbox.outgoing.filter((o) => isOpen(o.status) && o.role === o.last_actor);
  const recent = all.filter((o) => !isOpen(o.status));
  return { mine, toYou, youMade, recent };
}

// ---------------------------------------------------------------------------
// Inbox by side (DEC 90): Buying / Selling, "Needs you" first, then earlier.

export type InboxSide = 'buying' | 'selling';

export type InboxRow =
  | { kind: 'offer'; id: string; at: string; needsYou: boolean; offer: Offer }
  | { kind: 'chat'; id: string; at: string; needsYou: boolean; chat: ChatSummary };

const byNewest = (a: InboxRow, b: InboxRow) => Date.parse(b.at) - Date.parse(a.at);

/**
 * Offers and chats on one side of the inbox. Buying is where I'm the buyer,
 * Selling where I'm the seller. Needs you: an open offer waiting on my answer,
 * or a chat with unread messages. Everything else is Earlier. Newest first.
 */
export function inboxRows(
  inbox: Inbox,
  side: InboxSide,
): { needsYou: InboxRow[]; earlier: InboxRow[] } {
  const role: Role = side === 'buying' ? 'buyer' : 'seller';
  const rows: InboxRow[] = [
    ...[...inbox.incoming, ...inbox.outgoing]
      .filter((o) => o.role === role)
      .map((o): InboxRow => ({
        kind: 'offer',
        id: o.id,
        at: o.responded_at ?? o.created_at,
        needsYou: isOpen(o.status) && o.role !== o.last_actor,
        offer: o,
      })),
    ...inbox.chats
      .filter((c) => c.role === role)
      .map((c): InboxRow => ({
        kind: 'chat',
        id: c.id,
        at: c.last_message?.created_at ?? c.last_message_at,
        needsYou: c.unread,
        chat: c,
      })),
  ];
  return {
    needsYou: rows.filter((r) => r.needsYou).sort(byNewest),
    earlier: rows.filter((r) => !r.needsYou).sort(byNewest),
  };
}

/** How many rows need me on each side, for the segment badges. */
export function needsYouCounts(inbox: Inbox): Record<InboxSide, number> {
  return {
    buying: inboxRows(inbox, 'buying').needsYou.length,
    selling: inboxRows(inbox, 'selling').needsYou.length,
  };
}

/** Where an offer stands, in a few plain words for an inbox row. */
export function offerStatusShort(
  o: Pick<Offer, 'status' | 'role' | 'last_actor' | 'amount_cents' | 'listing'>,
): string {
  const amount = money(o.amount_cents);
  if (isOpen(o.status)) {
    const myTurn = o.role !== o.last_actor;
    if (o.status === 'pending') {
      return fill(myTurn ? copy.inboxStatus.offered : copy.inboxStatus.sent, { amount });
    }
    return fill(myTurn ? copy.inboxStatus.countered : copy.inboxStatus.youCountered, { amount });
  }
  if (o.status === 'accepted') return fill(copy.inboxStatus.accepted, { amount });
  if (o.status === 'auto_declined') {
    return o.listing?.status === 'hold' ? copy.status.hold_other : copy.status.auto_declined;
  }
  return copy.status[o.status];
}

/** "now", "12m", "3h", then the weekday within a week, then the date. */
export function shortAgo(iso: string, now: Date, locale: string): string {
  const then = new Date(iso);
  const mins = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 60_000));
  if (mins < 1) return copy.timeNow;
  if (mins < 60) return fill(copy.timeMinutes, { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return fill(copy.timeHours, { n: hours });
  if (hours < 24 * 7) return then.toLocaleDateString(locale, { weekday: 'short' });
  return then.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}
