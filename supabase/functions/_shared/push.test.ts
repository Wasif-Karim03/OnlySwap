// P9-PUSH-03 send-push / push-receipts core (T-FN-07 function half).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  chunk,
  handlePushReceipts,
  handleSendPush,
  toMessages,
  type ClaimedPush,
  type ExpoMessage,
  type SendDeps,
} from './push.ts';

const KEY = 'service-key';
const req = (authorization: string | null = `Bearer ${KEY}`) => ({ method: 'POST', authorization });

const push = (id: number, tokens = 1, ts = false): ClaimedPush => ({
  id,
  type: 'offer_new',
  grp: 'offers',
  title: 'New offer',
  body: 'Ben offered $35',
  data: { offer_id: 'o1' },
  time_sensitive: ts,
  badge: 3,
  tokens: Array.from({ length: tokens }, (_, i) => ({
    id: `t${id}-${i}`,
    token: `ExponentPushToken[${id}-${i}]`,
    platform: i % 2 ? 'android' : 'ios',
  })),
});

test('only the service key', async () => {
  const deps = {
    keys: [KEY],
    claim: async () => [],
    finish: async () => {},
    send: async () => [],
  } as SendDeps;
  assert.equal((await handleSendPush(req('Bearer nope'), deps)).status, 401);
  assert.equal(
    (await handleSendPush({ method: 'GET', authorization: `Bearer ${KEY}` }, deps)).status,
    405,
  );
});

test('messages carry the channel, badge, priority and iOS interruption level', () => {
  const [ios, android] = toMessages(push(1, 2, true));
  assert.equal(ios!.message.interruptionLevel, 'time-sensitive');
  assert.equal(ios!.message.priority, 'high');
  assert.equal(android!.message.interruptionLevel, undefined);
  assert.equal(android!.message.channelId, 'offers');
  assert.equal(android!.message.badge, 3);
  assert.deepEqual(android!.message.data, {
    offer_id: 'o1',
    type: 'offer_new',
    notification_id: 1,
  });
});

test('batches of 100 and one ticket per device', async () => {
  const claimed = Array.from({ length: 150 }, (_, i) => push(i + 1));
  const batches: ExpoMessage[][] = [];
  let finished: { id: number; tickets: { status: string; error?: string }[] }[] = [];
  const res = await handleSendPush(req(), {
    keys: [KEY],
    claim: async () => claimed,
    send: async (m) => {
      batches.push(m);
      return m.map((x, i) =>
        x.to.startsWith('ExponentPushToken[7-')
          ? { status: 'error' as const, details: { error: 'DeviceNotRegistered' } }
          : { status: 'ok' as const, id: `tk-${batches.length}-${i}` },
      );
    },
    finish: async (r) => {
      finished = r;
    },
  });
  assert.deepEqual(
    batches.map((b) => b.length),
    [100, 50],
  );
  assert.equal(res.body.sent, 149);
  assert.equal(res.body.failed, 1);
  assert.equal(finished.length, 150);
  assert.equal(finished.find((f) => f.id === 7)!.tickets[0]!.error, 'DeviceNotRegistered');
});

test('an Expo outage marks the batch failed instead of throwing', async () => {
  let finished: { id: number; tickets: { status: string }[] }[] = [];
  const res = await handleSendPush(req(), {
    keys: [KEY],
    claim: async () => [push(1)],
    send: async () => {
      throw new Error('503');
    },
    finish: async (r) => {
      finished = r;
    },
  });
  assert.equal(res.status, 200);
  assert.equal(finished[0]!.tickets[0]!.status, 'error');
});

test('two runs over the same due rows send each once (claims never overlap)', async () => {
  // The database hands each row to one claim only (skip locked); simulate that.
  const due = Array.from({ length: 300 }, (_, i) => push(i + 1));
  const sentIds: number[] = [];
  const claim = async (limit: number) => due.splice(0, Math.min(limit, 200));
  const deps: SendDeps = {
    keys: [KEY],
    claim,
    send: async (m) => {
      m.forEach((x) =>
        sentIds.push(Number((x.data as { notification_id: number }).notification_id)),
      );
      return m.map(() => ({ status: 'ok' as const, id: 'x' }));
    },
    finish: async () => {},
  };
  await Promise.all([handleSendPush(req(), deps), handleSendPush(req(), deps)]);
  assert.equal(sentIds.length, 300);
  assert.equal(new Set(sentIds).size, 300);
});

test('receipts: errors are recorded, missing ones wait', async () => {
  let finished: { id: number; status: string; error?: string }[] = [];
  const res = await handlePushReceipts(req(), {
    keys: [KEY],
    pending: async () => [
      { id: 1, ticket_id: 'a', token_id: 't1' },
      { id: 2, ticket_id: 'b', token_id: 't2' },
      { id: 3, ticket_id: 'c', token_id: 't3' },
    ],
    receipts: async () => ({
      a: { status: 'ok' },
      b: { status: 'error', details: { error: 'DeviceNotRegistered' } },
    }),
    finish: async (r) => {
      finished = r;
    },
  });
  assert.deepEqual(finished, [
    { id: 1, status: 'ok' },
    { id: 2, status: 'error', error: 'DeviceNotRegistered' },
  ]);
  assert.equal(res.body.disabled, 1);
});

test('chunk', () => {
  assert.deepEqual(chunk([1, 2, 3], 2), [[1, 2], [3]]);
});
