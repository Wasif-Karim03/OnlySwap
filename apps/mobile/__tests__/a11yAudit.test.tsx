/**
 * P11-A11Y-01 automated pass over the main screens (the manual VoiceOver /
 * TalkBack walk stays in the testing phase): every pressable element has a
 * role and a name (a label or visible text), and no pressable is hidden from
 * screen readers.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Text } from 'react-native';
import type { ReactTestRendererJSON } from 'react-test-renderer';

import type { ChatApi, ChatInfo } from '../src/features/chat/api';
import { ChatScreen } from '../src/features/chat/ChatScreen';
import { createChatStore } from '../src/features/chat/useChat';
import type { FeedApi } from '../src/features/feed/api';
import { DiscoverScreen } from '../src/features/feed/DiscoverScreen';
import { ListingScreen } from '../src/features/feed/ListingScreen';
import type { FeedItem, ListingResult } from '../src/features/feed/logic';
import { createSwipeStore } from '../src/features/feed/swipes';
import type { MeApi } from '../src/features/me/api';
import { ProfileTabScreen } from '../src/features/me/MeScreens';
import { SettingsScreen } from '../src/features/me/SettingsScreens';
import type { MeetupsApi } from '../src/features/meetups/api';
import { MeetupDayScreen } from '../src/features/meetups/MeetupDayScreen';
import type { OffersApi } from '../src/features/offers/api';
import { InboxScreen } from '../src/features/offers/InboxScreen';
import { OfferSheetScreen } from '../src/features/offers/OfferSheetScreen';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

type Node = ReactTestRendererJSON;

function textOf(n: Node | string | null): string {
  if (n === null) return '';
  if (typeof n === 'string') return n;
  return (n.children ?? []).map((c) => textOf(c as Node | string)).join('');
}

/** Problems found in a rendered tree. */
export function audit(root: Node | Node[] | null): string[] {
  const problems: string[] = [];
  const visit = (n: Node | string, hidden: boolean) => {
    if (typeof n === 'string') return;
    const p = n.props as Record<string, unknown>;
    const nowHidden =
      hidden ||
      p.accessibilityElementsHidden === true ||
      p.importantForAccessibility === 'no-hide-descendants';
    const pressable = typeof p.onClick === 'function' || typeof p.onResponderRelease === 'function';
    if (pressable && p.accessible !== false && !nowHidden) {
      const name = (p.accessibilityLabel as string | undefined) ?? textOf(n);
      const where = (p.testID as string | undefined) ?? name.slice(0, 30) ?? n.type;
      if (!p.accessibilityRole && !p.role) problems.push(`no role: ${where}`);
      if (!name.trim()) problems.push(`no name: ${where}`);
    }
    for (const c of n.children ?? []) visit(c as Node | string, nowHidden);
  };
  for (const r of Array.isArray(root) ? root : root ? [root] : []) visit(r, false);
  return problems;
}

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
    { index: () => <Stub id="screen-index" />, ...routes },
    { initialUrl, wrapper },
  );
}

const item = (n: number, patch: Partial<FeedItem> = {}): FeedItem =>
  ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    kind: 'sale',
    status: 'active',
    title: `Item ${n}`,
    description: 'Works great',
    price_cents: 1500,
    condition: 'good',
    category_id: 1,
    open_to_offers: true,
    meet_spot_ids: [],
    meet_note: null,
    availability: [],
    save_count: 2,
    view_count: 0,
    offer_count: 0,
    bumped_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    expires_at: null,
    is_own: false,
    saved: false,
    watching: false,
    seller: { id: 's1', display_name: 'Aisha A.', avatar_path: null, year: null, created_at: null },
    photos: [{ path: 'p', thumb_path: 't', blurhash: null, width: 1, height: 1 }],
    ...patch,
  }) as FeedItem;

const feedApi = (): FeedApi => ({
  getFeed: jest.fn(async () => Array.from({ length: 3 }, (_, i) => item(i + 1))),
  recordSwipes: jest.fn(async () => {}),
  undoSwipe: jest.fn(async () => {}),
  save: jest.fn(async () => 1),
  unsave: jest.fn(async () => 0),
  hide: jest.fn(async () => {}),
  watch: jest.fn(async () => {}),
  recordView: jest.fn(async () => {}),
  getListing: jest.fn(async () => ({ ...item(1), access: 'buyer' }) as ListingResult),
  reportListing: jest.fn(async () => {}),
});

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => jest.restoreAllMocks());

describe('the audit itself', () => {
  it('catches an unnamed, role-less pressable', () => {
    const { Pressable, View } = jest.requireActual('react-native');
    const { render: plain } = jest.requireActual('@testing-library/react-native');
    const r = plain(
      <View>
        {/* eslint-disable-next-line react-native-a11y/has-valid-accessibility-descriptors -- the case the audit must catch */}
        <Pressable onPress={() => {}} testID="bad">
          <View />
        </Pressable>
        <Pressable onPress={() => {}} accessibilityRole="button" accessibilityLabel="Fine" />
      </View>,
    );
    expect(audit(r.toJSON())).toEqual(['no role: bad', 'no name: bad']);
  });
});

describe('P11-A11Y-01 every control has a role and a name', () => {
  it('Discover deck', async () => {
    const api = feedApi();
    const swipes = createSwipeStore({ get: () => undefined, set: () => {} }, api);
    render(
      {
        discover: () => (
          <DiscoverScreen
            api={api}
            swipes={swipes}
            coach={{ seen: () => true, markSeen: jest.fn() }}
          />
        ),
      },
      '/discover',
    );
    await screen.findByTestId('deck-offer');
    expect(audit(screen.toJSON())).toEqual([]);
  });

  it('Discover list mode (screen reader)', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    const api = feedApi();
    const swipes = createSwipeStore({ get: () => undefined, set: () => {} }, api);
    render(
      {
        discover: () => (
          <DiscoverScreen
            api={api}
            swipes={swipes}
            coach={{ seen: () => true, markSeen: jest.fn() }}
          />
        ),
      },
      '/discover',
    );
    await screen.findByTestId('deck-list');
    expect(audit(screen.toJSON())).toEqual([]);
  });

  it('Listing', async () => {
    render(
      {
        'listing/[id]/index': () => (
          <ListingScreen id="L1" api={feedApi()} spots={async () => []} />
        ),
      },
      '/listing/L1',
    );
    await screen.findByTestId('listing-offer');
    expect(audit(screen.toJSON())).toEqual([]);
  });

  it('Offer sheet', async () => {
    const offers = { make: jest.fn() } as unknown as OffersApi;
    render(
      {
        'listing/[id]/offer': () => (
          <OfferSheetScreen
            listingId="L1"
            api={offers}
            listings={{ getListing: feedApi().getListing }}
          />
        ),
      },
      '/listing/L1/offer',
    );
    await screen.findByTestId('offer-send');
    expect(audit(screen.toJSON())).toEqual([]);
  });

  it('Inbox', async () => {
    const offers = {
      inbox: jest.fn(async () => ({ incoming: [], outgoing: [], chats: [] })),
    } as unknown as OffersApi;
    render(
      {
        inbox: () => (
          <InboxScreen
            api={offers}
            realtime={{ userId: async () => null, subscribe: () => () => {} }}
          />
        ),
      },
      '/inbox',
    );
    await screen.findByTestId('inbox-empty');
    expect(audit(screen.toJSON())).toEqual([]);
  });

  it('Chat', async () => {
    const chat: ChatApi = {
      chat: jest.fn(
        async () =>
          ({
            id: 'c1',
            listing_id: 'l1',
            status: 'open',
            listing_title: 'Lamp',
            listing_price_cents: 1500,
            listing_thumb_path: null,
            agreed_cents: 1200,
            role: 'buyer',
            other: { id: 'u1', display_name: 'Aisha A.', avatar_path: null },
            blocked: false,
            i_blocked: false,
            other_deleted: false,
            my_first_message: true,
          }) as unknown as ChatInfo,
      ),
      messages: jest.fn(async () => [
        {
          id: 1,
          chat_id: 'c1',
          sender_id: 'u1',
          kind: 'text',
          body: 'Hi',
          meta: null,
          client_id: null,
          created_at: '',
        },
      ]),
      send: jest.fn(),
      markRead: jest.fn(async () => {}),
      mute: jest.fn(),
      hide: jest.fn(),
      report: jest.fn(),
    } as ChatApi;
    const meetups = { forChat: jest.fn(async () => null) } as unknown as MeetupsApi;
    const store = createChatStore('c1', { api: chat, me: () => 'me' });
    render(
      {
        'chat/[id]/index': () => (
          <ChatScreen
            id="c1"
            me="me"
            api={chat}
            meetups={meetups}
            store={store}
            realtime={{ userId: async () => 'me', subscribe: () => () => {} }}
          />
        ),
      },
      '/chat/c1',
    );
    await screen.findByTestId('chat-input');
    expect(audit(screen.toJSON())).toEqual([]);
  });

  it('Meetup day', async () => {
    const meetups = {
      get: jest.fn(async () => ({
        id: 'm1',
        chat_id: 'c1',
        status: 'confirmed',
        starts_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        spot: { id: 's', name: 'Library', lat: 1, lng: 2, police: true, hours: null },
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
      })),
    } as unknown as MeetupsApi;
    render(
      { 'meetup/[id]': () => <MeetupDayScreen id="m1" otherName="Aisha" api={meetups} /> },
      '/meetup/m1',
    );
    await screen.findByTestId('meetup-here');
    expect(audit(screen.toJSON())).toEqual([]);
  });

  it('Profile and Settings', async () => {
    const me = {
      me: jest.fn(async () => ({
        id: 'u',
        display_name: 'Aisha A.',
        avatar_path: null,
        campus: { short_name: 'Ohio State' },
        founding_seller: false,
        counts: { active: 0, sold: 0, saved: 0, swaps: 0, thumbs_up: 0, thumbs_total: 0 },
      })),
    } as unknown as MeApi;
    render({ profile: () => <ProfileTabScreen api={me} /> }, '/profile');
    await screen.findByText('Aisha A.');
    expect(audit(screen.toJSON())).toEqual([]);
    screen.unmount();
    render({ settings: () => <SettingsScreen auth={{ signOut: jest.fn() }} /> }, '/settings');
    await waitFor(() => expect(screen.getByTestId('screen-settings')).toBeTruthy());
    expect(audit(screen.toJSON())).toEqual([]);
  });
});
