import { fill } from '@/lib/format';
import { offers as copy } from '@/strings/en';

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
  const d = cents / 100;
  return `$${Number.isInteger(d) ? d.toLocaleString('en-US') : d.toFixed(2)}`;
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
