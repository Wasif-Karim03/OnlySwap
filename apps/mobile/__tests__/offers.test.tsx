import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import type { FeedApi } from '../src/features/feed/api';
import type { FeedItem, ListingResult } from '../src/features/feed/logic';
import type { OffersApi } from '../src/features/offers/api';
import { InboxScreen } from '../src/features/offers/InboxScreen';
import { ListingOffersScreen } from '../src/features/offers/ListingOffersScreen';
import {
  inboxSections,
  isLowOffer,
  money,
  offerView,
  quickAmounts,
  type Offer,
  type OfferStatus,
  type Role,
} from '../src/features/offers/logic';
import { OfferScreen } from '../src/features/offers/OfferScreen';
import { OfferSheetScreen } from '../src/features/offers/OfferSheetScreen';
import type { RealtimeSource } from '../src/lib/realtime';
import { offers } from '../src/strings/en';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const offer = (patch: Partial<Offer> = {}): Offer => ({
  id: 'o1',
  listing_id: 'l1',
  amount_cents: 3500,
  note: null,
  quick_notes: [],
  status: 'pending',
  round: 1,
  last_actor: 'buyer',
  decline_reason: null,
  expires_at: '2027-03-12T17:00:00Z',
  responded_at: null,
  created_at: '2027-03-10T17:00:00Z',
  role: 'seller',
  chat_id: null,
  listing: {
    id: 'l1',
    title: 'Mini fridge',
    price_cents: 4000,
    kind: 'sale',
    status: 'active',
    thumb_path: null,
  },
  other: { id: 'u2', display_name: 'Ben B.', avatar_path: null },
  ...patch,
});

describe('T-UNIT-OFF-01 offer sheet logic', () => {
  it('quick amounts: ask, 10% and 20% less, rounded to $1', () => {
    expect(quickAmounts(4000).map((q) => q.cents)).toEqual([4000, 3600, 3200]);
    expect(quickAmounts(1250).map((q) => q.cents)).toEqual([1250, 1100, 1000]);
    expect(quickAmounts(100).map((q) => q.cents)).toEqual([100]);
    expect(quickAmounts(0)).toEqual([]);
  });

  it('warns under half the asking price', () => {
    expect(isLowOffer(1999, 4000)).toBe(true);
    expect(isLowOffer(2000, 4000)).toBe(false);
    expect(isLowOffer(0, 0)).toBe(false);
  });

  it('formats money', () => {
    expect(money(3500)).toBe('$35');
    expect(money(3550)).toBe('$35.50');
    expect(money(120000)).toBe('$1,200');
  });
});

describe('T-UNIT-OFF-02 offer status → UI', () => {
  const statuses: OfferStatus[] = [
    'pending',
    'countered',
    'accepted',
    'declined',
    'expired',
    'withdrawn',
    'auto_declined',
  ];
  const roles: Role[] = ['buyer', 'seller'];

  it.each(statuses.flatMap((s) => roles.map((r) => [s, r] as const)))(
    '%s as %s',
    (status, role) => {
      const last: Role = status === 'countered' ? 'seller' : 'buyer';
      const v = offerView(
        offer({ status, role, last_actor: last, chat_id: status === 'accepted' ? 'c1' : null }),
      );
      const myTurn = (status === 'pending' || status === 'countered') && role !== last;
      if (myTurn) {
        expect(v.actions).toContain('accept');
        expect(v.actions).toContain('decline');
        expect(v.frame === 'E3' || v.frame === 'E4').toBe(true);
      } else if (status === 'pending' || status === 'countered') {
        expect(v.frame).toBe('E5');
        expect(v.actions).toEqual(role === 'buyer' ? ['withdraw'] : []);
      } else if (status === 'accepted') {
        expect(v).toMatchObject({ frame: 'E6', actions: ['open_chat'] });
      } else if (status === 'auto_declined') {
        expect(v.frame).toBe('E8');
      } else {
        expect(v.frame).toBe('E7');
        expect(v.actions).toEqual(role === 'buyer' ? ['offer_again'] : []);
      }
    },
  );

  it('no counter in round 4 or for free items; on hold with someone else', () => {
    expect(offerView(offer({ round: 4 })).actions).not.toContain('counter');
    expect(
      offerView(offer({ listing: { ...offer().listing!, kind: 'free' } })).actions,
    ).not.toContain('counter');
    expect(
      offerView(
        offer({ status: 'auto_declined', listing: { ...offer().listing!, status: 'hold' } }),
      ).line,
    ).toBe(offers.status.hold_other);
  });

  it('sorts the inbox by whose turn it is', () => {
    const s = inboxSections({
      incoming: [offer({ id: 'a' }), offer({ id: 'b', status: 'countered', last_actor: 'seller' })],
      outgoing: [
        offer({ id: 'c', role: 'buyer' }),
        offer({ id: 'd', role: 'buyer', status: 'countered', last_actor: 'seller' }),
        offer({ id: 'e', role: 'buyer', status: 'declined' }),
      ],
    });
    expect(s.mine.map((o) => o.id)).toEqual(['a', 'd']);
    expect(s.toYou.map((o) => o.id)).toEqual(['b']);
    expect(s.youMade.map((o) => o.id)).toEqual(['c']);
    expect(s.recent.map((o) => o.id)).toEqual(['e']);
  });
});

// ---------------------------------------------------------------------------

function Stub({ id }: { id: string }) {
  return <Text testID={id}>{id}</Text>;
}
function render(routes: Record<string, () => ReactNode>, initialUrl: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderRouter(
    {
      index: () => <Stub id="screen-index" />,
      inbox: () => <Stub id="screen-inbox-stub" />,
      discover: () => <Stub id="screen-discover" />,
      'chat/[id]': () => <Stub id="screen-chat" />,
      'offer/[id]': () => <Stub id="screen-offer-stub" />,
      'listing/[id]/index': () => <Stub id="screen-listing" />,
      ...routes,
    },
    { initialUrl, wrapper },
  );
}

function api(over: Partial<OffersApi> = {}): OffersApi {
  return {
    make: jest.fn(async () => offer()),
    accept: jest.fn(async () => ({ chat_id: 'c1' })),
    counter: jest.fn(async () => offer()),
    decline: jest.fn(async () => {}),
    withdraw: jest.fn(async () => {}),
    get: jest.fn(async () => offer()),
    inbox: jest.fn(async () => ({ incoming: [], outgoing: [], chats: [] })),
    listingOffers: jest.fn(async () => []),
    ...over,
  };
}

const item = (patch: Partial<FeedItem> = {}) =>
  ({
    id: 'l1',
    kind: 'sale',
    status: 'active',
    title: 'Mini fridge',
    price_cents: 4000,
    open_to_offers: true,
    seller: { id: 'u1', display_name: 'Aisha A.' },
    access: 'buyer',
    ...patch,
  }) as unknown as ListingResult;

const listings = (r: ListingResult): Pick<FeedApi, 'getListing'> => ({
  getListing: jest.fn(async () => r),
});

describe('B05 Offer sheet', () => {
  it('sends a quick amount with notes and shows success', async () => {
    const a = api();
    render(
      {
        'listing/[id]/offer': () => (
          <OfferSheetScreen listingId="l1" api={a} listings={listings(item())} />
        ),
      },
      '/listing/l1/offer',
    );
    fireEvent.press(await screen.findByText(`$32 · ${offers.quickLess.replace('{pct}', '20')}`));
    fireEvent.press(screen.getByText(offers.quickNotes.today));
    fireEvent.press(screen.getByTestId('offer-send'));
    await waitFor(() =>
      expect(a.make).toHaveBeenCalledWith('l1', 3200, '', [offers.quickNotes.today]),
    );
    expect(await screen.findByTestId('offer-sent')).toBeTruthy();
  });

  it('warns on a low offer', async () => {
    render(
      {
        'listing/[id]/offer': () => (
          <OfferSheetScreen listingId="l1" api={api()} listings={listings(item())} />
        ),
      },
      '/listing/l1/offer',
    );
    fireEvent.changeText(await screen.findByTestId('offer-amount'), '10');
    expect(screen.getByText(offers.lowWarning)).toBeTruthy();
  });

  it('free items are asked for at $0', async () => {
    const a = api();
    render(
      {
        'listing/[id]/offer': () => (
          <OfferSheetScreen
            listingId="l1"
            api={a}
            listings={listings(item({ kind: 'free', price_cents: 0 }))}
          />
        ),
      },
      '/listing/l1/offer',
    );
    fireEvent.press(await screen.findByTestId('offer-send'));
    await waitFor(() => expect(a.make).toHaveBeenCalledWith('l1', 0, '', []));
    expect(await screen.findByText(offers.askedTitle)).toBeTruthy();
  });

  it('paused accounts see why', async () => {
    const a = api({ make: jest.fn(async () => Promise.reject({ message: 'OFFERS_PAUSED' })) });
    render(
      {
        'listing/[id]/offer': () => (
          <OfferSheetScreen listingId="l1" api={a} listings={listings(item())} />
        ),
      },
      '/listing/l1/offer',
    );
    fireEvent.press(await screen.findByTestId('offer-send'));
    expect(await screen.findByText(offers.pausedTitle)).toBeTruthy();
  });

  it('rate limit shows inline', async () => {
    const a = api({
      make: jest.fn(async () =>
        Promise.reject({ message: 'RATE_LIMITED:make_offer:2027-03-10T23:00:00Z' }),
      ),
    });
    render(
      {
        'listing/[id]/offer': () => (
          <OfferSheetScreen listingId="l1" api={a} listings={listings(item())} />
        ),
      },
      '/listing/l1/offer',
    );
    fireEvent.press(await screen.findByTestId('offer-send'));
    expect(await screen.findByText(/doing that a lot/)).toBeTruthy();
  });
});

describe('E02 Offer', () => {
  it('seller accepts and lands in the chat', async () => {
    const a = api();
    render({ 'offer/[id]': () => <OfferScreen id="o1" api={a} /> }, '/offer/o1');
    fireEvent.press(await screen.findByTestId('offer-accept'));
    await waitFor(() => expect(a.accept).toHaveBeenCalledWith('o1'));
    expect(await screen.findByTestId('screen-chat')).toBeTruthy();
  });

  it('seller counters', async () => {
    const a = api();
    render({ 'offer/[id]': () => <OfferScreen id="o1" api={a} /> }, '/offer/o1');
    fireEvent.press(await screen.findByTestId('offer-counter'));
    fireEvent.changeText(await screen.findByTestId('counter-amount'), '38');
    fireEvent.press(screen.getByTestId('counter-send'));
    await waitFor(() => expect(a.counter).toHaveBeenCalledWith('o1', 3800));
  });

  it('seller declines with a reason', async () => {
    const a = api();
    render({ 'offer/[id]': () => <OfferScreen id="o1" api={a} /> }, '/offer/o1');
    fireEvent.press(await screen.findByTestId('offer-decline'));
    fireEvent.press(await screen.findByText(offers.declineReasons.low));
    fireEvent.press(screen.getByTestId('decline-confirm'));
    await waitFor(() => expect(a.decline).toHaveBeenCalledWith('o1', offers.declineReasons.low));
  });

  it('buyer waiting can withdraw', async () => {
    const a = api({ get: jest.fn(async () => offer({ role: 'buyer' })) });
    render({ 'offer/[id]': () => <OfferScreen id="o1" api={a} /> }, '/offer/o1');
    expect(await screen.findByTestId('screen-offer-E5')).toBeTruthy();
    fireEvent.press(screen.getByTestId('offer-withdraw'));
    fireEvent.press(await screen.findByText(offers.withdrawConfirm));
    await waitFor(() => expect(a.withdraw).toHaveBeenCalledWith('o1'));
  });

  it('accepted opens the chat', async () => {
    const a = api({ get: jest.fn(async () => offer({ status: 'accepted', chat_id: 'c9' })) });
    render({ 'offer/[id]': () => <OfferScreen id="o1" api={a} /> }, '/offer/o1');
    fireEvent.press(await screen.findByTestId('offer-open-chat'));
    expect(await screen.findByTestId('screen-chat')).toBeTruthy();
  });
});

describe('E01 Inbox', () => {
  it('lists offers by turn, chats with unread, and refetches on a realtime ping', async () => {
    let ping: () => void = () => {};
    const realtime: RealtimeSource = {
      userId: async () => 'me',
      subscribe: (_t, _e, cb) => {
        ping = () => cb({});
        return () => {};
      },
    };
    const inbox = jest
      .fn()
      .mockResolvedValueOnce({ incoming: [offer({ id: 'a' })], outgoing: [], chats: [] })
      .mockResolvedValue({
        incoming: [
          offer({ id: 'a' }),
          offer({ id: 'b', other: { id: 'u3', display_name: 'Cam C.', avatar_path: null } }),
        ],
        outgoing: [],
        chats: [
          {
            id: 'c1',
            listing_id: 'l1',
            offer_id: 'o1',
            status: 'open',
            listing_title: 'Lamp',
            listing_price_cents: 1200,
            listing_thumb_path: null,
            agreed_cents: 1000,
            role: 'buyer',
            last_message_at: '',
            muted: false,
            unread: true,
            last_message: { kind: 'text', body: 'Still there?', mine: false, created_at: '' },
            other: { id: 'u1', display_name: 'Aisha A.', avatar_path: null },
          },
        ],
      });
    render({ inbox: () => <InboxScreen api={api({ inbox })} realtime={realtime} /> }, '/inbox');
    expect(await screen.findByTestId('inbox-offer-a')).toBeTruthy();
    expect(screen.getByTestId('inbox-mine')).toBeTruthy();
    await act(async () => ping());
    expect(await screen.findByTestId('inbox-offer-b')).toBeTruthy();
    fireEvent.press(screen.getByText(offers.tabChats));
    expect(await screen.findByTestId('unread-c1')).toBeTruthy();
    fireEvent.press(screen.getByTestId('inbox-chat-c1'));
    expect(await screen.findByTestId('screen-chat')).toBeTruthy();
  });

  it('empty state', async () => {
    render(
      {
        inbox: () => (
          <InboxScreen
            api={api()}
            realtime={{ userId: async () => null, subscribe: () => () => {} }}
          />
        ),
      },
      '/inbox',
    );
    expect(await screen.findByTestId('inbox-empty')).toBeTruthy();
  });
});

describe('F05 Offers on a listing', () => {
  it('lists offers in arrival order', async () => {
    const a = api({
      listingOffers: jest.fn(async () => [
        offer({ id: 'x1' }),
        offer({ id: 'x2', amount_cents: 0 }),
      ]),
    });
    render(
      { 'listing/[id]/offers': () => <ListingOffersScreen listingId="l1" api={a} /> },
      '/listing/l1/offers',
    );
    expect(await screen.findByTestId('listing-offer-x1')).toBeTruthy();
    fireEvent.press(screen.getByTestId('listing-offer-x2'));
    expect(await screen.findByTestId('screen-offer-stub')).toBeTruthy();
  });
});
