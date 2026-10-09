import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import type { ChatApi, ChatInfo } from '../src/features/chat/api';
import { ChatScreen } from '../src/features/chat/ChatScreen';
import type { Message } from '../src/features/chat/logic';
import { createChatStore } from '../src/features/chat/useChat';
import type { FeedApi } from '../src/features/feed/api';
import type { MeetupsApi } from '../src/features/meetups/api';
import { meetupOtherName, whenParts, type Meetup } from '../src/features/meetups/logic';
import { MeetupCard } from '../src/features/meetups/MeetupCard';
import { MeetupDayScreen } from '../src/features/meetups/MeetupDayScreen';
import type { OffersApi } from '../src/features/offers/api';
import { InboxScreen } from '../src/features/offers/InboxScreen';
import {
  inboxRows,
  needsYouCounts,
  offerStatusShort,
  shortAgo,
  type ChatSummary,
  type Inbox,
  type Offer,
} from '../src/features/offers/logic';
import { OfferSheetScreen } from '../src/features/offers/OfferSheetScreen';
import { heroCellAt, heroRect, heroRows, heroSlot } from '../src/features/sell/logic';
import { PhotoGrid } from '../src/features/sell/PhotoGrid';
import type { RealtimeSource } from '../src/lib/realtime';
import { chat, meetup, offers } from '../src/strings/en';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const NOW = new Date(2027, 2, 10, 12, 0); // local 12:00

function Stub({ id }: { id: string }) {
  return <Text testID={id}>{id}</Text>;
}

function renderAt(routes: Record<string, () => ReactNode>, initialUrl: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderRouter(
    {
      index: () => <Stub id="screen-index" />,
      'chat/[id]/index': () => <Stub id="screen-chat" />,
      'chat/[id]/meetup': () => <Stub id="screen-plan" />,
      'offer/[id]': () => <Stub id="screen-offer-stub" />,
      inbox: () => <Stub id="screen-inbox" />,
      ...routes,
    },
    { initialUrl, wrapper },
  );
}

const quiet: RealtimeSource = { userId: async () => null, subscribe: () => () => {} };

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
  created_at: new Date(2027, 2, 10, 11, 48).toISOString(),
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
  other: { id: 'u2', display_name: 'Priya S.', avatar_path: null },
  ...patch,
});

const chatSummary = (patch: Partial<ChatSummary> = {}): ChatSummary => ({
  id: 'c1',
  listing_id: 'l2',
  offer_id: 'o9',
  status: 'open',
  listing_title: 'Film camera',
  listing_price_cents: 6000,
  listing_thumb_path: null,
  agreed_cents: 5500,
  role: 'buyer',
  last_message_at: new Date(2027, 2, 10, 9, 0).toISOString(),
  muted: false,
  unread: false,
  last_message: {
    kind: 'text',
    body: 'See you at 3',
    mine: false,
    created_at: new Date(2027, 2, 10, 9, 0).toISOString(),
  },
  other: { id: 'u1', display_name: 'Jordan K.', avatar_path: null },
  ...patch,
});

const inboxData = (): Inbox => ({
  incoming: [offer()],
  outgoing: [
    offer({
      id: 'o2',
      role: 'buyer',
      last_actor: 'buyer',
      amount_cents: 10000,
      created_at: new Date(2027, 2, 10, 10, 0).toISOString(),
      other: { id: 'u3', display_name: 'Sam T.', avatar_path: null },
    }),
  ],
  chats: [chatSummary(), chatSummary({ id: 'c2', role: 'buyer', unread: true })],
});

// ---------------------------------------------------------------------------

describe('DEC 90 Sell photos: big cover slot', () => {
  it('lays the cover over two rows, two beside it, then rows of three', () => {
    expect(heroSlot(0)).toEqual({ col: 0, row: 0, span: 2 });
    expect(heroSlot(1)).toEqual({ col: 2, row: 0, span: 1 });
    expect(heroSlot(2)).toEqual({ col: 2, row: 1, span: 1 });
    expect(heroSlot(3)).toEqual({ col: 0, row: 2, span: 1 });
    expect(heroSlot(5)).toEqual({ col: 2, row: 2, span: 1 });
    expect(heroSlot(6)).toEqual({ col: 0, row: 3, span: 1 });
    expect(heroRows(1)).toBe(2);
    expect(heroRows(3)).toBe(2);
    expect(heroRows(4)).toBe(3);
    expect(heroRect(0, 100, 8)).toEqual({ x: 0, y: 0, size: 208 });
    expect(heroRect(2, 100, 8)).toEqual({ x: 216, y: 108, size: 100 });
  });

  it('drops a dragged photo on the slot under the finger, clamped to the photos', () => {
    expect(heroCellAt(150, 150, 100, 8, 5)).toBe(0);
    expect(heroCellAt(260, 40, 100, 8, 5)).toBe(1);
    expect(heroCellAt(260, 160, 100, 8, 5)).toBe(2);
    expect(heroCellAt(150, 260, 100, 8, 5)).toBe(4);
    // Past the last photo: the nearest photo slot.
    expect(heroCellAt(260, 260, 100, 8, 3)).toBe(2);
  });

  it('puts the add tile in the next slot after the photos', () => {
    render(
      <PhotoGrid
        photos={[{ id: 'p1', uri: 'file://a.jpg', width: 1, height: 1, status: 'done' }]}
        progress={{}}
        sourceOf={(p) => p.uri}
        onLibrary={jest.fn()}
        onRemove={jest.fn()}
        onRetry={jest.fn()}
        onMove={jest.fn()}
      />,
    );
    fireEvent(screen.getByTestId('sell-photo-grid'), 'layout', {
      nativeEvent: { layout: { width: 316, height: 0 } },
    });
    const add = StyleSheet.flatten(screen.getByTestId('sell-add-library').props.style);
    expect(add).toMatchObject({ left: 216, top: 0, width: 100, height: 100 });
    const grid = StyleSheet.flatten(screen.getByTestId('sell-photo-grid').props.style);
    expect(grid.height).toBe(208);
  });
});

describe('DEC 90 Inbox: Buying and Selling', () => {
  it('splits by side, needs you first, newest first', () => {
    const data = inboxData();
    const buying = inboxRows(data, 'buying');
    expect(buying.needsYou.map((r) => r.id)).toEqual(['c2']);
    expect(buying.earlier.map((r) => r.id)).toEqual(['o2', 'c1']);
    const selling = inboxRows(data, 'selling');
    expect(selling.needsYou.map((r) => r.id)).toEqual(['o1']);
    expect(selling.earlier).toEqual([]);
    expect(needsYouCounts(data)).toEqual({ buying: 1, selling: 1 });
  });

  it('says where an offer stands in a few plain words', () => {
    expect(offerStatusShort(offer())).toBe('Offered $35');
    expect(offerStatusShort(offer({ role: 'buyer' }))).toBe('Offer sent $35');
    expect(
      offerStatusShort(offer({ status: 'countered', last_actor: 'seller', role: 'buyer' })),
    ).toBe('Countered $35');
    expect(offerStatusShort(offer({ status: 'countered', last_actor: 'seller' }))).toBe(
      'You countered $35',
    );
    expect(offerStatusShort(offer({ status: 'declined' }))).toBe(offers.status.declined);
  });

  it('keeps times short', () => {
    const at = (h: number, m: number) => new Date(2027, 2, 10, h, m).toISOString();
    expect(shortAgo(at(11, 59), NOW, 'en-US')).toBe('1m');
    expect(shortAgo(NOW.toISOString(), NOW, 'en-US')).toBe('now');
    expect(shortAgo(at(9, 0), NOW, 'en-US')).toBe('3h');
    expect(shortAgo(new Date(2027, 2, 8, 9, 0).toISOString(), NOW, 'en-US')).toBe('Mon');
  });

  it('shows rows with the item, the person, the status and a badge per side', async () => {
    const api = { inbox: jest.fn(async () => inboxData()) } as unknown as OffersApi;
    renderAt({ inbox: () => <InboxScreen api={api} realtime={quiet} now={() => NOW} /> }, '/inbox');
    expect(await screen.findByTestId('inbox-needs-you')).toBeTruthy();
    expect(screen.getByTestId('inbox-earlier')).toBeTruthy();
    // Opens on Buying when both sides need you.
    expect(screen.getByTestId('inbox-chat-c2')).toBeTruthy();
    expect(screen.getByText(offers.needsYou)).toBeTruthy();
    expect(screen.getByText('Offer sent $100')).toBeTruthy();
    expect(screen.getByTestId('unread-c2')).toBeTruthy();
    expect(screen.getByLabelText(`${offers.tabSelling}, 1 need you`)).toBeTruthy();
    fireEvent.press(screen.getByLabelText(`${offers.tabSelling}, 1 need you`));
    expect(await screen.findByText('Offered $35')).toBeTruthy();
    expect(screen.getByText('Priya S.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('inbox-offer-o1'));
    expect(await screen.findByTestId('screen-offer-stub')).toBeTruthy();
  });

  it('has an empty state for each side', async () => {
    const api = {
      inbox: jest.fn(async () => ({ incoming: [], outgoing: [], chats: [] })),
    } as unknown as OffersApi;
    renderAt({ inbox: () => <InboxScreen api={api} realtime={quiet} /> }, '/inbox');
    expect(await screen.findByText(offers.emptyBuyingTitle)).toBeTruthy();
    fireEvent.press(screen.getByText(offers.tabSelling));
    expect(await screen.findByText(offers.emptySellingTitle)).toBeTruthy();
  });
});

describe('DEC 90 Make an offer', () => {
  it('shows a big number, quick picks, the pay line and an ink Send offer', async () => {
    const listings = {
      getListing: jest.fn(async () => ({
        id: 'l1',
        kind: 'sale',
        status: 'active',
        title: 'Desk lamp',
        price_cents: 800,
        open_to_offers: true,
        seller: { id: 'u1', display_name: 'Jordan K.' },
        photos: [],
        access: 'buyer',
      })),
    } as unknown as Pick<FeedApi, 'getListing'>;
    const api = { make: jest.fn(async () => ({})) } as unknown as OffersApi;
    renderAt(
      {
        'listing/[id]/offer': () => (
          <OfferSheetScreen listingId="l1" api={api} listings={listings} mediaBase={() => ''} />
        ),
      },
      '/listing/l1/offer',
    );
    const amount = await screen.findByTestId('offer-amount');
    expect(amount.props.value).toBe('$8');
    expect(screen.getByText('Asking $8 · Jordan K.')).toBeTruthy();
    expect(screen.getByText(offers.payInPerson)).toBeTruthy();
    fireEvent.press(screen.getByText('$7'));
    expect(screen.getByTestId('offer-amount').props.value).toBe('$7');
    fireEvent.changeText(screen.getByTestId('offer-amount'), '$6.5');
    expect(screen.getByTestId('offer-amount').props.value).toBe('$6.5');
    expect(screen.getByRole('button', { name: offers.send })).toBeTruthy();
    fireEvent.press(screen.getByTestId('offer-send'));
    await waitFor(() => expect(api.make).toHaveBeenCalledWith('l1', 650, '', []));
  });
});

// ---------------------------------------------------------------------------

const info = (patch: Partial<ChatInfo> = {}): ChatInfo => ({
  ...chatSummary(),
  blocked: false,
  i_blocked: false,
  other_deleted: false,
  listing_status: 'hold',
  buyer_outcome: null,
  seller_outcome: null,
  my_first_message: false,
  ...patch,
});

const meetupRow = (patch: Partial<Meetup> = {}): Meetup => ({
  id: 'm1',
  chat_id: 'c1',
  status: 'confirmed',
  starts_at: new Date(2027, 2, 10, 15, 0).toISOString(),
  spot: { id: 's1', name: 'Student center', lat: 40, lng: -83, police: false, hours: null },
  custom_place: null,
  proposed_by_me: false,
  confirmed_at: null,
  my_here_at: null,
  other_here_at: null,
  late_minutes: null,
  late_is_me: false,
  cancelled_by_me: false,
  cancel_reason: null,
  previous_starts_at: null,
  share_token: null,
  my_noshow_report: null,
  ...patch,
});

const meetupsApi = (over: Partial<MeetupsApi> = {}): MeetupsApi => ({
  propose: jest.fn(),
  confirm: jest.fn(async () => {}),
  checkIn: jest.fn(async () => {}),
  late: jest.fn(async () => {}),
  cancel: jest.fn(async () => {}),
  get: jest.fn(async () => meetupRow()),
  forChat: jest.fn(async () => null),
  share: jest.fn(async () => ({ token: 't', expires_at: '' })),
  noShow: jest.fn(async () => {}),
  ...over,
});

describe('DEC 90 Chat', () => {
  it('pins the item with the price in person and Accepted, system rows as pills', async () => {
    const msgs: Message[] = [
      {
        id: 1,
        chat_id: 'c1',
        sender_id: null,
        kind: 'system',
        body: 'You accepted $55',
        meta: null,
        client_id: null,
        created_at: '',
      },
    ];
    const api = {
      chat: jest.fn(async () => info()),
      messages: jest.fn(async () => msgs),
      markRead: jest.fn(async () => {}),
    } as unknown as ChatApi;
    const store = createChatStore('c1', { api, me: () => 'me' });
    renderAt(
      {
        'chat/[id]/index': () => (
          <ChatScreen
            id="c1"
            me="me"
            api={api}
            meetups={meetupsApi({ forChat: jest.fn(async () => meetupRow()) })}
            realtime={quiet}
            store={store}
            now={() => NOW}
          />
        ),
      },
      '/chat/c1',
    );
    expect(await screen.findByText('$55 in person')).toBeTruthy();
    expect(screen.getByTestId('chat-deal-status').props.children).toBe(chat.accepted);
    expect(await screen.findByText('You accepted $55')).toBeTruthy();
    expect(await screen.findByTestId('meetup-card-confirmed')).toBeTruthy();
  });
});

describe('DEC 90 Meetup', () => {
  it('confirmed card reads "Meetup today, 3:00 PM" with the place', async () => {
    renderAt(
      {
        'chat/[id]/index': () => (
          <MeetupCard
            meetup={meetupRow()}
            chatId="c1"
            otherName="Jordan K."
            api={meetupsApi()}
            onChanged={jest.fn()}
            now={() => NOW}
          />
        ),
      },
      '/chat/c1',
    );
    expect(await screen.findByText('Meetup today, 3:00 PM')).toBeTruthy();
    expect(screen.getByText('Student center')).toBeTruthy();
  });

  it('splits the day from the time', () => {
    expect(whenParts(new Date(2027, 2, 10, 15, 0).toISOString(), NOW)).toMatchObject({
      day: meetup.todayLower,
      dayTitle: meetup.today,
      time: '3:00 PM',
      isToday: true,
    });
    expect(whenParts(new Date(2027, 2, 11, 9, 0).toISOString(), NOW).day).toBe(
      meetup.tomorrowLower,
    );
  });

  it('picks the name from the chat, then the passed name, then Deleted user', () => {
    const c = { other_deleted: false, other: { display_name: 'Jordan K.' } };
    expect(meetupOtherName(c, 'Old name', 'Deleted user')).toBe('Jordan K.');
    expect(meetupOtherName(null, 'Jordan K.', 'Deleted user')).toBe('Jordan K.');
    expect(meetupOtherName(null, '', 'Deleted user')).toBe('');
    expect(meetupOtherName({ other_deleted: true, other: null }, 'X', 'Deleted user')).toBe(
      'Deleted user',
    );
  });

  it('opened from a notification (id only) still shows who and what, from the chat', async () => {
    const chats = { chat: jest.fn(async () => info()) };
    renderAt(
      {
        'meetup/[id]': () => (
          <MeetupDayScreen
            id="m1"
            api={meetupsApi()}
            chats={chats}
            mediaBase={() => ''}
            now={() => NOW}
          />
        ),
      },
      '/meetup/m1',
    );
    expect(await screen.findByText('Jordan K.')).toBeTruthy();
    expect(chats.chat).toHaveBeenCalledWith('c1');
    expect(screen.getByText('Film camera · $55 in person')).toBeTruthy();
    const status = screen.getByTestId('meetup-other-status');
    expect(status.props.children).toBe(meetup.notHereShort);
    expect(status.props.accessibilityLabel).toBe("Jordan K. hasn't checked in");
    // The big time with the day above it, and the plain countdown.
    expect(screen.getByText('3:00 PM')).toBeTruthy();
    expect(screen.getByText(meetup.today)).toBeTruthy();
    expect(screen.getByText('Starts in 3 h 0 min')).toBeTruthy();
    expect(screen.getByText(meetup.spotMeta)).toBeTruthy();
    // Not near the time yet: no I'm here; 911 is there.
    expect(screen.queryByTestId('meetup-here')).toBeNull();
    expect(screen.getByTestId('meetup-911')).toBeTruthy();
  });
});
