import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';

import type { ChatApi, ChatInfo } from '../src/features/chat/api';
import { ChatScreen } from '../src/features/chat/ChatScreen';
import {
  bubbleAspect,
  chatPhotoUrl,
  isNewContact,
  mergeMessages,
  newContactFromItems,
  type ChatItem,
  type Message,
} from '../src/features/chat/logic';
import { createChatStore } from '../src/features/chat/useChat';
import type { AppConfig } from '../src/features/auth/logic';
import type { OsApi } from '../src/lib/permissions';
import type { RealtimeSource } from '../src/lib/realtime';
import { chat, report } from '../src/strings/en';

const NOW = new Date('2027-03-10T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const msg = (id: number, patch: Partial<Message> = {}): Message => ({
  id,
  chat_id: 'c1',
  sender_id: 'u1',
  kind: 'text',
  body: `m${id}`,
  meta: null,
  client_id: null,
  created_at: ago(48 * HOUR),
  ...patch,
});

const SIGNED = 'c/campus/chat/c1/11111111-1111-4111-8111-111111111111_full.webp?exp=1&sig=ab';

describe('T-UNIT-CHAT-03 photo blur rule (new contact)', () => {
  it('is a new contact under 10 messages from them or under 24 hours', () => {
    const old = ago(25 * HOUR);
    expect(isNewContact({ otherMessages: 9, chatStartedAt: old, now: NOW })).toBe(true);
    expect(isNewContact({ otherMessages: 10, chatStartedAt: old, now: NOW })).toBe(false);
    expect(isNewContact({ otherMessages: 50, chatStartedAt: ago(23 * HOUR), now: NOW })).toBe(true);
    expect(isNewContact({ otherMessages: 50, chatStartedAt: ago(24 * HOUR), now: NOW })).toBe(
      false,
    );
  });

  it('an unknown or broken start counts as new', () => {
    expect(isNewContact({ otherMessages: 50, chatStartedAt: null, now: NOW })).toBe(true);
    expect(isNewContact({ otherMessages: 50, chatStartedAt: 'nope', now: NOW })).toBe(true);
  });

  it('counts only their text and photo messages; the oldest loaded one stands in for the start', () => {
    const theirs = Array.from({ length: 10 }, (_, i) => msg(i + 2));
    const items = mergeMessages(
      [],
      [msg(1, { kind: 'system', sender_id: null, created_at: ago(30 * HOUR) }), ...theirs],
      'me',
    );
    expect(newContactFromItems(items, NOW)).toBe(false);
    // Nine from them plus my own and system rows: still new.
    const mixed = mergeMessages(
      [],
      [
        msg(1, { kind: 'system', sender_id: null, created_at: ago(30 * HOUR) }),
        ...theirs.slice(1),
        msg(20, { sender_id: 'me' }),
        msg(21, { kind: 'meetup', sender_id: null }),
      ],
      'me',
    );
    expect(newContactFromItems(mixed, NOW)).toBe(true);
    // The server's created_at wins over the oldest loaded message.
    expect(newContactFromItems(items, NOW, ago(2 * HOUR))).toBe(true);
    expect(newContactFromItems([], NOW)).toBe(true);
  });
});

describe('chat photo URL (signed path)', () => {
  it('joins the media base and keeps the signature query', () => {
    expect(chatPhotoUrl('https://m.onlyswap.app/', SIGNED)).toBe(
      `https://m.onlyswap.app/${SIGNED}`,
    );
    expect(chatPhotoUrl('https://m.onlyswap.app', `/${SIGNED}`)).toBe(
      `https://m.onlyswap.app/${SIGNED}`,
    );
    expect(chatPhotoUrl('https://m.onlyswap.app', null)).toBeNull();
    expect(chatPhotoUrl('https://m.onlyswap.app', '')).toBeNull();
  });

  it('keeps bubbles to a sane shape', () => {
    expect(bubbleAspect(1080, 810)).toBeCloseTo(4 / 3);
    expect(bubbleAspect(100, 1000)).toBe(0.6);
    expect(bubbleAspect(3000, 100)).toBe(1.8);
    expect(bubbleAspect(0, 0)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Store: photo send path

const LOCAL = { uri: 'file:///tmp/p.jpg', width: 1200, height: 900 };
const photoMsg = (id: number, clientId: string, body: string | null = null) =>
  msg(id, {
    kind: 'photo',
    body,
    client_id: clientId,
    sender_id: 'me',
    photo_path: 'c/x/chat/c1/k_full.webp',
    photo_url: SIGNED,
  });

describe('T-UNIT-CHAT-02 photo messages in the send queue', () => {
  let n = 0;
  const uuid = () => `k${++n}`;
  beforeEach(() => {
    n = 0;
  });

  it('shows a pending bubble with progress, uploads, then sends kind photo with the caption', async () => {
    let finish: (key: string) => void = () => {};
    let report: (f: number) => void = () => {};
    const uploadPhoto = jest.fn(
      (_c: string, _p: unknown, onProgress: (f: number) => void) =>
        new Promise<string>((resolve) => {
          report = onProgress;
          finish = resolve;
        }),
    );
    const sendPhoto = jest.fn(async (_c: string, caption: string, clientId: string) =>
      photoMsg(30, clientId, caption || null),
    );
    const store = createChatStore('c1', {
      api: { messages: jest.fn(async () => []), send: jest.fn(), uploadPhoto, sendPhoto },
      me: () => 'me',
      uuid,
    });
    const sending = store.getState().sendPhoto(LOCAL, '  is this the one?  ');
    expect(store.getState().items[0]).toMatchObject({
      state: 'pending',
      kind: 'photo',
      body: 'is this the one?',
      local: LOCAL,
      progress: 0,
    });
    act(() => report(0.5));
    expect(store.getState().items[0]).toMatchObject({ progress: 0.5 });
    finish('c/x/chat/c1/k_full.webp');
    await sending;
    expect(uploadPhoto).toHaveBeenCalledWith('c1', LOCAL, expect.any(Function));
    expect(sendPhoto).toHaveBeenCalledWith(
      'c1',
      'is this the one?',
      'k1',
      'c/x/chat/c1/k_full.webp',
    );
    // Sent, and my own picked file stays on screen (no reload).
    expect(store.getState().items[0]).toMatchObject({ state: 'sent', id: 30, local: LOCAL });
  });

  it('a failed send keeps the upload; retry only sends again', async () => {
    const uploadPhoto = jest.fn(async () => 'c/x/chat/c1/k_full.webp');
    const sendPhoto = jest
      .fn()
      .mockRejectedValueOnce({ message: 'RATE_LIMITED:send_photo' })
      .mockImplementation(async (_c: string, caption: string, clientId: string) =>
        photoMsg(31, clientId, caption || null),
      );
    const store = createChatStore('c1', {
      api: { messages: jest.fn(async () => []), send: jest.fn(), uploadPhoto, sendPhoto },
      me: () => 'me',
      uuid,
    });
    await store.getState().sendPhoto(LOCAL, '');
    expect(store.getState().items[0]).toMatchObject({
      state: 'failed',
      photo_path: 'c/x/chat/c1/k_full.webp',
    });
    await store.getState().retry('k1');
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    expect(sendPhoto).toHaveBeenCalledTimes(2);
    expect(store.getState().items[0]).toMatchObject({ state: 'sent', id: 31 });
  });

  it('a failed upload is marked failed and retry uploads again', async () => {
    const uploadPhoto = jest
      .fn()
      .mockRejectedValueOnce({ message: 'upload 500', status: 500 })
      .mockResolvedValue('c/x/chat/c1/k_full.webp');
    const sendPhoto = jest.fn(async (_c: string, _b: string, clientId: string) =>
      photoMsg(32, clientId),
    );
    const store = createChatStore('c1', {
      api: { messages: jest.fn(async () => []), send: jest.fn(), uploadPhoto, sendPhoto },
      me: () => 'me',
      uuid,
    });
    await store.getState().sendPhoto(LOCAL, '');
    expect(store.getState().items[0]!.state).toBe('failed');
    await store.getState().retry('k1');
    expect(uploadPhoto).toHaveBeenCalledTimes(2);
    expect(store.getState().items[0]).toMatchObject({ state: 'sent', id: 32 });
  });

  it('offline photos queue in order with text and go out on reconnect', async () => {
    let online = false;
    const order: string[] = [];
    const offline = () => {
      throw { code: 'ERR_OFFLINE', message: 'Network request failed' };
    };
    const uploadPhoto = jest.fn(async () => {
      if (!online) offline();
      return 'c/x/chat/c1/k_full.webp';
    });
    let id = 40;
    const sendPhoto = jest.fn(async (_c: string, _b: string, clientId: string) => {
      order.push('photo');
      return photoMsg(++id, clientId);
    });
    const send = jest.fn(async (_c: string, body: string, clientId: string) => {
      if (!online) offline();
      order.push(body);
      return msg(++id, { body, client_id: clientId, sender_id: 'me' });
    });
    const store = createChatStore('c1', {
      api: { messages: jest.fn(async () => []), send, uploadPhoto, sendPhoto },
      me: () => 'me',
      uuid,
    });
    await store.getState().send('first');
    await store.getState().sendPhoto(LOCAL, '');
    await store.getState().send('after');
    expect(store.getState().items.map((m) => m.state)).toEqual(['pending', 'pending', 'pending']);
    // Queued, not "uploading 0%".
    const queued = store.getState().items[1] as ChatItem & { progress?: number };
    expect(queued.kind).toBe('photo');
    expect(queued.progress).toBeUndefined();
    online = true;
    await store.getState().flushPending();
    expect(order).toEqual(['first', 'photo', 'after']);
    expect(store.getState().items.map((m) => m.state)).toEqual(['sent', 'sent', 'sent']);
  });

  it('refetches one message for a fresh signature, at most once a minute', async () => {
    let t = NOW.getTime();
    const messages = jest.fn(async () => [
      msg(5, { kind: 'photo', photo_url: `${SIGNED}2`, body: null }),
    ]);
    const store = createChatStore('c1', {
      api: { messages, send: jest.fn() },
      me: () => 'me',
      uuid,
      now: () => new Date(t),
    });
    await store.getState().refreshMessage(5);
    await store.getState().refreshMessage(5);
    expect(messages).toHaveBeenCalledTimes(1);
    expect(messages).toHaveBeenCalledWith('c1', { after: 4, limit: 1 });
    const item = store.getState().items[0] as ChatItem & { photo_url?: string | null };
    expect(item.photo_url).toBe(`${SIGNED}2`);
    t += 61_000;
    await store.getState().refreshMessage(5);
    expect(messages).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Screen

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
  my_first_message: false,
  ...patch,
});

function fakeApi(over: Partial<ChatApi> = {}): ChatApi {
  return {
    chat: jest.fn(async () => info()),
    messages: jest.fn(async () => [
      msg(1, { kind: 'system', sender_id: null, body: 'Offer accepted at $38.' }),
      msg(2, { body: 'here it is' }),
      msg(5, { kind: 'photo', body: 'the fridge', photo_url: SIGNED }),
    ]),
    send: jest.fn(async (_c, body, clientId) =>
      msg(9, { body, client_id: clientId, sender_id: 'me' }),
    ),
    sendPhoto: jest.fn(async (_c, caption, clientId) => photoMsg(10, clientId, caption || null)),
    uploadPhoto: jest.fn(async () => 'c/x/chat/c1/k_full.webp'),
    markRead: jest.fn(async () => {}),
    mute: jest.fn(async () => {}),
    hide: jest.fn(async () => {}),
    report: jest.fn(async () => {}),
    reportMessage: jest.fn(async () => {}),
    ...over,
  };
}

const realtime: RealtimeSource = {
  userId: async () => 'me',
  subscribe: () => () => {},
};

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

const config = (on: boolean) => ({
  getAppConfig: jest.fn(async (): Promise<AppConfig> => ({
    maintenance: { enabled: false, until: null },
    minVersionIos: '0',
    minVersionAndroid: '0',
    rulesVersion: '1',
    rulesChanges: [],
    chatPhotosEnabled: on,
  })),
});

const granted: OsApi = {
  get: jest.fn(async () => ({ status: 'granted' as const, canAskAgain: true })),
  request: jest.fn(async () => ({ status: 'granted' as const, canAskAgain: true })),
};

function renderChat(api: ChatApi, flag: boolean, extra: { pick?: jest.Mock } = {}) {
  const store = createChatStore('c1', { api, me: () => 'me', now: () => NOW });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  renderRouter(
    {
      'chat/[id]/index': () => (
        <ChatScreen
          id="c1"
          me="me"
          api={api}
          meetups={noMeetups}
          realtime={realtime}
          store={store}
          config={config(flag)}
          people={{ block: jest.fn(async () => {}) }}
          pick={extra.pick ?? jest.fn(async () => [LOCAL])}
          photosOs={granted}
          cameraOs={granted}
          mediaBase={() => 'https://m.test'}
          now={() => NOW}
        />
      ),
    },
    { initialUrl: '/chat/c1', wrapper },
  );
  return store;
}

describe('E03 Chat photos (P8-CHAT-04)', () => {
  it('hides the photo button when chat_photos_enabled is off', async () => {
    renderChat(fakeApi(), false);
    expect(await screen.findByTestId('chat-input')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('chat-photo')).toBeNull());
  });

  it('hides it on a closed chat even with the flag on', async () => {
    renderChat(fakeApi({ chat: jest.fn(async () => info({ status: 'closed' })) }), true);
    expect(await screen.findByTestId('chat-read-only')).toBeTruthy();
    expect(screen.queryByTestId('chat-photo')).toBeNull();
  });

  it('picks from the library and sends with the typed caption', async () => {
    const api = fakeApi();
    const pick = jest.fn(async () => [LOCAL]);
    renderChat(api, true, { pick });
    fireEvent.changeText(await screen.findByTestId('chat-input'), 'still available?');
    fireEvent.press(await screen.findByTestId('chat-photo'));
    fireEvent.press(await screen.findByTestId('chat-photo-library'));
    await waitFor(() =>
      expect(api.sendPhoto).toHaveBeenCalledWith(
        'c1',
        'still available?',
        expect.any(String),
        'c/x/chat/c1/k_full.webp',
      ),
    );
    expect(pick).toHaveBeenCalledWith('library');
    expect(await screen.findByText('still available?')).toBeTruthy();
    expect(screen.getByTestId('chat-input').props.value).toBe('');
  });

  it('shows upload progress, then failed with retry', async () => {
    let report: (f: number) => void = () => {};
    let fail: (e: unknown) => void = () => {};
    const uploadPhoto = jest
      .fn()
      .mockImplementationOnce(
        (_c: string, _p: unknown, onProgress: (f: number) => void) =>
          new Promise<string>((_resolve, reject) => {
            report = onProgress;
            fail = reject;
          }),
      )
      .mockResolvedValue('c/x/chat/c1/k_full.webp');
    const api = fakeApi({ uploadPhoto });
    renderChat(api, true);
    fireEvent.press(await screen.findByTestId('chat-photo'));
    fireEvent.press(await screen.findByTestId('chat-photo-camera'));
    await waitFor(() => expect(uploadPhoto).toHaveBeenCalled());
    act(() => report(0.4));
    expect(await screen.findByText(chat.uploading.replace('{percent}', '40'))).toBeTruthy();
    await act(async () => fail({ message: 'upload 500', status: 500 }));
    expect(await screen.findByText(chat.failed)).toBeTruthy();
    fireEvent.press(screen.getByLabelText(`${chat.yourPhoto}. ${chat.failed}`));
    await waitFor(() => expect(api.sendPhoto).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(chat.failed)).toBeNull());
  });

  it("blurs a new contact's photo until tapped, then opens the viewer", async () => {
    renderChat(fakeApi(), true);
    expect(await screen.findByTestId('msg-5-blurred')).toBeTruthy();
    expect(screen.getByText(chat.tapToView)).toBeTruthy();
    expect(
      screen.getByTestId('msg-5-photo-image', { includeHiddenElements: true }).props.source,
    ).toEqual([{ uri: `https://m.test/${SIGNED}` }]);
    fireEvent.press(screen.getByTestId('msg-5-tap'));
    await waitFor(() => expect(screen.queryByTestId('msg-5-blurred')).toBeNull());
    expect(screen.getByText('the fridge')).toBeTruthy();
    // Past the 500 ms double-tap guard.
    const later = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
    fireEvent.press(screen.getByTestId('msg-5-tap'));
    later.mockRestore();
    expect(await screen.findByTestId('chat-photo-viewer')).toBeTruthy();
  });

  it('does not blur once they are a known contact', async () => {
    const many = Array.from({ length: 10 }, (_, i) => msg(i + 2));
    const api = fakeApi({
      messages: jest.fn(async () => [
        msg(1, { kind: 'system', sender_id: null, created_at: ago(30 * HOUR) }),
        ...many,
        msg(20, { kind: 'photo', body: null, photo_url: SIGNED }),
      ]),
    });
    renderChat(api, true);
    expect(await screen.findByTestId('msg-20-photo', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('msg-20-blurred')).toBeNull();
  });

  it('refetches the message when the signed URL fails to load', async () => {
    const api = fakeApi();
    renderChat(api, true);
    fireEvent(
      await screen.findByTestId('msg-5-photo-image', { includeHiddenElements: true }),
      'error',
      { nativeEvent: { error: 'expired' } },
    );
    await waitFor(() => expect(api.messages).toHaveBeenCalledWith('c1', { after: 4, limit: 1 }));
  });

  it('reports a photo message with a long press', async () => {
    const api = fakeApi();
    renderChat(api, true);
    fireEvent(await screen.findByTestId('msg-5-tap'), 'longPress');
    expect(await screen.findByText(report.titleMessage)).toBeTruthy();
    fireEvent.press(screen.getByText(report.reasons.person.scam));
    fireEvent.press(screen.getByText(report.send));
    await waitFor(() => expect(api.reportMessage).toHaveBeenCalledWith(5, 'scam', ''));
  });
});
