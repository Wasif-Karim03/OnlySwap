import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import type { ChatApi, ChatInfo } from '../src/features/chat/api';
import { ChatDetailsScreen } from '../src/features/chat/ChatDetailsScreen';
import { ChatScreen } from '../src/features/chat/ChatScreen';
import type { Message } from '../src/features/chat/logic';
import { createChatStore } from '../src/features/chat/useChat';
import type { RealtimeSource } from '../src/lib/realtime';
import { chat } from '../src/strings/en';

const info = (patch: Partial<ChatInfo> = {}): ChatInfo => ({
  id: 'c1',
  listing_id: 'l1',
  offer_id: 'o1',
  status: 'open',
  listing_title: 'Mini fridge',
  listing_price_cents: 4000,
  listing_thumb_path: null,
  agreed_cents: 3800,
  role: 'buyer',
  last_message_at: '',
  muted: false,
  unread: false,
  last_message: null,
  other: { id: 'u1', display_name: 'Aisha A.', avatar_path: null },
  blocked: false,
  i_blocked: false,
  other_deleted: false,
  listing_status: 'hold',
  buyer_outcome: null,
  seller_outcome: null,
  my_first_message: true,
  ...patch,
});

const msg = (id: number, patch: Partial<Message> = {}): Message => ({
  id,
  chat_id: 'c1',
  sender_id: 'u1',
  kind: 'text',
  body: `hello ${id}`,
  meta: null,
  client_id: null,
  created_at: '',
  ...patch,
});

function fakeApi(over: Partial<ChatApi> = {}): ChatApi {
  return {
    chat: jest.fn(async () => info()),
    messages: jest.fn(async () => [
      msg(1, { kind: 'system', sender_id: null, body: 'Offer accepted at $38. Plan the pickup.' }),
      msg(2, { body: 'Pay with Venmo first' }),
    ]),
    send: jest.fn(async (_c, body, clientId) =>
      msg(3, { body, client_id: clientId, sender_id: 'me' }),
    ),
    markRead: jest.fn(async () => {}),
    mute: jest.fn(async () => {}),
    hide: jest.fn(async () => {}),
    report: jest.fn(async () => {}),
    ...over,
  };
}

let push: (m: Message) => void = () => {};
const realtime: RealtimeSource = {
  userId: async () => 'me',
  subscribe: (_t, _e, cb) => {
    push = (m) => cb(m);
    return () => {};
  },
};

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
      inbox: () => <Stub id="screen-inbox" />,
      'listing/[id]/index': () => <Stub id="screen-listing" />,
      'user/[id]': () => <Stub id="screen-user" />,
      ...routes,
    },
    { initialUrl, wrapper },
  );
}

const noMeetups = {
  propose: jest.fn(),
  confirm: jest.fn(),
  checkIn: jest.fn(),
  late: jest.fn(),
  cancel: jest.fn(),
  get: jest.fn(),
  forChat: jest.fn(async () => null),
  share: jest.fn(),
  noShow: jest.fn(),
};

const chatRoute = (api: ChatApi) => {
  const store = createChatStore('c1', { api, me: () => 'me' });
  return {
    'chat/[id]/index': () => (
      <ChatScreen id="c1" me="me" api={api} meetups={noMeetups} realtime={realtime} store={store} />
    ),
    'chat/[id]/details': () => <Stub id="screen-details" />,
  };
};

describe('E03 Chat', () => {
  it('shows the deal bar, system row, safety tip and a scam hint; sends and receives', async () => {
    const api = fakeApi();
    render(chatRoute(api), '/chat/c1');
    expect(await screen.findByTestId('chat-deal-bar')).toBeTruthy();
    expect(screen.getByText('Offer accepted at $38. Plan the pickup.')).toBeTruthy();
    expect(screen.getByTestId('chat-safety-tip')).toBeTruthy();
    expect(screen.getByText(chat.scamHint.payment)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('chat-input'), 'Can we meet at 4?');
    fireEvent.press(screen.getByTestId('chat-send'));
    await waitFor(() =>
      expect(api.send).toHaveBeenCalledWith('c1', 'Can we meet at 4?', expect.any(String)),
    );
    expect(await screen.findByText('Can we meet at 4?')).toBeTruthy();
    await act(async () => push(msg(4, { body: 'Sure, see you' })));
    expect(await screen.findByText('Sure, see you')).toBeTruthy();
    expect(api.markRead).toHaveBeenCalledWith('c1');
  });

  it('a failed message offers retry', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce({ message: 'CHAT_BLOCKED' })
      .mockImplementation(async (_c, body, clientId) =>
        msg(9, { body, client_id: clientId, sender_id: 'me' }),
      );
    const api = fakeApi({ send });
    render(chatRoute(api), '/chat/c1');
    fireEvent.changeText(await screen.findByTestId('chat-input'), 'hello?');
    fireEvent.press(screen.getByTestId('chat-send'));
    expect(await screen.findByText(chat.failed)).toBeTruthy();
    fireEvent.press(screen.getByLabelText(`hello?. ${chat.failed}`));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  });

  it.each([
    [{ status: 'closed' as const }, chat.closed],
    [{ blocked: true }, chat.blocked],
    [{ blocked: true, i_blocked: true }, 'You blocked Aisha A..'],
  ])('read-only %o', async (patch, text) => {
    render(chatRoute(fakeApi({ chat: jest.fn(async () => info(patch)) })), '/chat/c1');
    expect(await screen.findByTestId('chat-read-only')).toBeTruthy();
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByTestId('chat-input')).toBeNull();
  });

  it('a deleted counterpart reads as Deleted user', async () => {
    render(
      chatRoute(fakeApi({ chat: jest.fn(async () => info({ other_deleted: true, other: null })) })),
      '/chat/c1',
    );
    expect(await screen.findByText(chat.deletedUser)).toBeTruthy();
  });
});

describe('E04 Chat details', () => {
  it('mutes, hides and blocks', async () => {
    const api = fakeApi();
    const people = { block: jest.fn(async () => {}) };
    render(
      { 'chat/[id]/details': () => <ChatDetailsScreen id="c1" api={api} people={people} /> },
      '/chat/c1/details',
    );
    fireEvent.press(await screen.findByRole('switch'));
    await waitFor(() => expect(api.mute).toHaveBeenCalledWith('c1', true));
    fireEvent.press(screen.getByText('Block Aisha A.'));
    fireEvent.press(await screen.findByText('Block'));
    await waitFor(() => expect(people.block).toHaveBeenCalledWith('u1'));
    fireEvent.press(screen.getByText(chat.hide));
    await waitFor(() => expect(api.hide).toHaveBeenCalledWith('c1'));
    expect(await screen.findByTestId('screen-inbox')).toBeTruthy();
  });
});
