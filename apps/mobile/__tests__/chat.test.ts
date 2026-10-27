import {
  bubbleSpots,
  firstSentId,
  lastSentId,
  mergeMessages,
  scamHint,
  type ChatItem,
  type Message,
} from '../src/features/chat/logic';
import { chatStoreFor, createChatStore, resetChatStores } from '../src/features/chat/useChat';

const msg = (id: number, patch: Partial<Message> = {}): Message => ({
  id,
  chat_id: 'c1',
  sender_id: 'them',
  kind: 'text',
  body: `m${id}`,
  meta: null,
  client_id: null,
  created_at: '2027-03-10T12:00:00Z',
  ...patch,
});

const pending = (clientId: string, body = 'hi'): ChatItem => ({
  state: 'pending',
  id: null,
  client_id: clientId,
  body,
  kind: 'text',
  created_at: '',
  mine: true,
  sender_id: null,
  meta: null,
  chat_id: 'c1',
});

describe('T-UNIT-CHAT-01 useChat merge', () => {
  it('dedupes by id and orders by id', () => {
    const a = mergeMessages([], [msg(3), msg(1)], 'me');
    const b = mergeMessages(a, [msg(2), msg(3, { body: 'edited' })], 'me');
    expect(b.map((m) => m.id)).toEqual([1, 2, 3]);
    expect(b[2]!.body).toBe('edited');
  });

  it('a sent message replaces its pending copy by client_id', () => {
    const items = [pending('k1'), pending('k2')];
    const merged = mergeMessages(items, [msg(9, { client_id: 'k1', sender_id: 'me' })], 'me');
    expect(merged.map((m) => m.client_id)).toEqual(['k1', 'k2']);
    expect(merged[0]).toMatchObject({ state: 'sent', id: 9, mine: true });
    expect(merged[1]!.state).toBe('pending');
  });

  it('finds the first and last sent ids for paging and reconnect', () => {
    const items = mergeMessages([pending('k')], [msg(4), msg(7)], 'me');
    expect(firstSentId(items)).toBe(4);
    expect(lastSentId(items)).toBe(7);
    expect(lastSentId([pending('k')])).toBeNull();
  });
});

describe('T-UNIT-CHAT-02 send queue', () => {
  let n = 0;
  const uuid = () => `k${++n}`;
  beforeEach(() => {
    n = 0;
  });

  it('reconnect fetches since the last id', async () => {
    const messages = jest.fn(async (_c: string, o?: { after?: number }) =>
      o?.after ? [msg(6)] : [msg(4), msg(5)],
    );
    const store = createChatStore('c1', {
      api: { messages, send: jest.fn() },
      me: () => 'me',
      uuid,
    });
    await store.getState().load();
    await store.getState().catchUp();
    expect(messages).toHaveBeenLastCalledWith('c1', { after: 5, limit: 100 });
    expect(store.getState().items.map((m) => m.id)).toEqual([4, 5, 6]);
  });

  it('offline messages stay queued and go out in order on reconnect', async () => {
    let online = false;
    const sent: string[] = [];
    let id = 10;
    const send = jest.fn(async (_c: string, body: string, clientId: string) => {
      if (!online) throw { code: 'ERR_OFFLINE', message: 'Network request failed' };
      sent.push(body);
      return msg(++id, { body, client_id: clientId, sender_id: 'me' });
    });
    const store = createChatStore('c1', {
      api: { messages: jest.fn(async () => []), send },
      me: () => 'me',
      uuid,
    });
    await store.getState().send('one');
    await store.getState().send('two');
    await store.getState().send('three');
    expect(store.getState().items.map((m) => m.state)).toEqual(['pending', 'pending', 'pending']);
    online = true;
    await store.getState().flushPending();
    expect(sent).toEqual(['one', 'two', 'three']);
    expect(store.getState().items.map((m) => m.state)).toEqual(['sent', 'sent', 'sent']);
  });

  it('a server failure marks the message for retry', async () => {
    let fail = true;
    const send = jest.fn(async (_c: string, body: string, clientId: string) => {
      if (fail) throw { message: 'CHAT_BLOCKED' };
      return msg(20, { body, client_id: clientId, sender_id: 'me' });
    });
    const store = createChatStore('c1', {
      api: { messages: jest.fn(async () => []), send },
      me: () => 'me',
      uuid,
    });
    await store.getState().send('hello');
    expect(store.getState().items[0]!.state).toBe('failed');
    fail = false;
    await store.getState().retry('k1');
    expect(store.getState().items[0]).toMatchObject({ state: 'sent', id: 20 });
    expect(send).toHaveBeenLastCalledWith('c1', 'hello', 'k1');
  });

  it('realtime messages for another chat are ignored; blanks are not sent', async () => {
    const send = jest.fn();
    const store = createChatStore('c1', {
      api: { messages: jest.fn(async () => []), send },
      me: () => 'me',
      uuid,
    });
    store.getState().receive(msg(1, { chat_id: 'other' }));
    store.getState().receive(msg(2));
    await store.getState().send('   ');
    expect(store.getState().items.map((m) => m.id)).toEqual([2]);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('T-UNIT-CHAT-04 scam hint', () => {
  it.each([
    ['Pay with Venmo first please', 'payment'],
    ['send a $50 deposit to hold it', 'payment'],
    ['I only take gift cards', 'payment'],
    ['details at bit.ly/abc', 'link'],
    ['see https://example.com/x', 'link'],
    ['text me at (614) 555-0199', 'phone'],
    ['can we meet at 4:30 by the library?', null],
    ['', null],
  ])('%s → %s', (body, hint) => {
    expect(scamHint(body)).toBe(hint);
  });
});

describe('T-UNIT-CHAT-05 chat store cache (C-04)', () => {
  const api = { messages: jest.fn(async () => [msg(1, { sender_id: 'me' })]), send: jest.fn() };
  beforeEach(() => resetChatStores());

  it('a store made before the session loads is not reused once we know who we are', async () => {
    const early = chatStoreFor('c1', null, api);
    const later = chatStoreFor('c1', 'me', api);
    expect(later).not.toBe(early);
    await later.getState().load();
    expect(later.getState().items[0]!.mine).toBe(true);
    expect(chatStoreFor('c1', 'me', api)).toBe(later);
  });

  it('two accounts never share a store for the same chat', () => {
    expect(chatStoreFor('c1', 'a', api)).not.toBe(chatStoreFor('c1', 'b', api));
  });

  it('keeps at most 20 chats, dropping the least recently opened', () => {
    const first = chatStoreFor('c0', 'me', api);
    const second = chatStoreFor('c1', 'me', api);
    for (let i = 2; i < 20; i += 1) chatStoreFor(`c${i}`, 'me', api);
    // c0 was opened again, so c1 is now the oldest.
    expect(chatStoreFor('c0', 'me', api)).toBe(first);
    chatStoreFor('c20', 'me', api);
    expect(chatStoreFor('c0', 'me', api)).toBe(first);
    expect(chatStoreFor('c1', 'me', api)).not.toBe(second);
  });

  it('never drops a chat with unsent messages', async () => {
    const send = jest.fn(() => new Promise<never>(() => {}));
    const busy = chatStoreFor('busy', 'me', { messages: jest.fn(async () => []), send });
    await busy.getState().load();
    void busy.getState().send('hold on');
    for (let i = 0; i < 25; i += 1) chatStoreFor(`c${i}`, 'me', api);
    expect(chatStoreFor('busy', 'me', api)).toBe(busy);
  });
});

describe('T-UNIT-CHAT-06 bubble grouping (owner 2026-10-15)', () => {
  // Local times; the list hands bubbleSpots newest first.
  const at = (d: number, h: number, m: number) => new Date(2027, 2, d, h, m).toISOString();
  const item = (id: number, mine: boolean, created: string, kind: Message['kind'] = 'text') =>
    ({ ...msg(id, { kind, created_at: created }), state: 'sent', mine }) as ChatItem;
  const NOW = new Date(2027, 2, 10, 18, 0);

  it('same person within 3 minutes is one group; time under the last', () => {
    const oldestFirst = [
      item(1, false, at(10, 16, 0)),
      item(2, false, at(10, 16, 2)),
      item(3, true, at(10, 16, 3)),
      item(4, true, at(10, 16, 10)),
    ];
    const spots = bubbleSpots([...oldestFirst].reverse(), NOW).reverse();
    expect(spots.map((x) => [x.first, x.last])).toEqual([
      [true, false],
      [false, true],
      [true, true],
      [true, true],
    ]);
  });

  it('a day separator on the oldest message of each day: Today, Yesterday, then a date', () => {
    const oldestFirst = [
      item(1, false, at(7, 9, 0)),
      item(2, true, at(9, 9, 0)),
      item(3, true, at(9, 9, 1)),
      item(4, false, at(10, 9, 0)),
    ];
    const days = bubbleSpots([...oldestFirst].reverse(), NOW)
      .reverse()
      .map((x) => x.day);
    expect(days[0]).toBeInstanceOf(Date);
    expect(days.slice(1)).toEqual(['yesterday', null, 'today']);
  });

  it('a message with no server time yet counts as now (no crash)', () => {
    const spots = bubbleSpots([pending('p1'), item(1, true, at(10, 17, 59))], NOW);
    expect(spots[0]).toEqual({ first: false, last: true, day: null });
  });

  it('system rows never group, and a group breaks across midnight', () => {
    const oldestFirst = [
      item(1, true, at(9, 23, 59)),
      item(2, true, at(10, 0, 0)),
      item(3, false, at(10, 0, 1), 'system'),
      item(4, false, at(10, 0, 1), 'system'),
    ];
    const spots = bubbleSpots([...oldestFirst].reverse(), NOW).reverse();
    expect(spots.every((x) => x.first && x.last)).toBe(true);
  });
});
