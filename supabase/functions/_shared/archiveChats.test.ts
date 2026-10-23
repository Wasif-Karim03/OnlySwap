// archive-chats (IR-04, RV-01, IR3-01): a claimed chat is written under the
// key of its job token and marked archived only when nobody in its JSON is
// deleting; otherwise the object just written is deleted again and
// confirmed, and a failed delete stays on the durable cleanup list. A run
// that lost its job deletes only its own key (the key is unique per token).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  archiveChats,
  peopleIn,
  type ArchiveDeps,
  type ArchiveRow,
  type FinishResult,
} from './archiveChats.ts';

const row = (
  id: string,
  buyer: string | null,
  seller: string | null,
  senders: (string | null)[],
): ArchiveRow => ({
  id,
  token: `tok-${id}`,
  key: `archive/chats/${id}/tok-${id}.json`,
  chat: { id, buyer_id: buyer, seller_id: seller },
  messages: senders.map((s, i) => ({ id: i + 1, sender_id: s })),
});

function deps(deleting: Set<string>, over: Partial<ArchiveDeps> = {}) {
  const calls: string[] = [];
  const d: ArchiveDeps = {
    put: async (key) => void calls.push(`put:${key}`),
    finish: async (chatId, people, token): Promise<FinishResult> => {
      calls.push(`finish:${chatId}:${people.join(',')}:${token}`);
      return people.some((p) => deleting.has(p)) ? 'withheld' : 'archived';
    },
    remove: async (key) => void calls.push(`remove:${key}`),
    cleaned: async (items) => {
      calls.push(`cleaned:${items.map((i) => `${i.id}:${i.token}`).join(',')}`);
      return items.length;
    },
    ...over,
  };
  return { d, calls };
}

test('peopleIn lists both participants and every sender once, sorted', () => {
  assert.deepEqual(peopleIn(row('C1', 'u2', 'u1', ['u1', null, 'u2', 'u1'])), ['u1', 'u2']);
  assert.deepEqual(peopleIn(row('C1', null, 'u1', [null])), ['u1']);
});

test('IR-04 a chat with nobody deleting is written, then marked archived with its token', async () => {
  let body = '';
  const { d, calls } = deps(new Set(), {
    put: async (key, b) => {
      body = b;
      calls.push(`put:${key}`);
    },
  });
  assert.deepEqual(await archiveChats([row('C1', 'u2', 'u1', ['u1'])], d), {
    archived: 1,
    failed: 0,
    withheld: 0,
  });
  assert.deepEqual(calls, ['put:archive/chats/C1/tok-C1.json', 'finish:C1:u1,u2:tok-C1']);
  // The job token is not part of the archive.
  assert.deepEqual(Object.keys(JSON.parse(body)), ['id', 'chat', 'messages']);
});

test('IR-04 a JSON naming a person who is deleting is deleted again, confirmed and not marked', async () => {
  const { d, calls } = deps(new Set(['u1']));
  const tally = await archiveChats([row('C1', 'u2', 'u1', ['u1']), row('C2', 'u2', 'u3', [])], d);
  assert.deepEqual(tally, { archived: 1, failed: 0, withheld: 1 });
  assert.deepEqual(calls, [
    'put:archive/chats/C1/tok-C1.json',
    'finish:C1:u1,u2:tok-C1',
    'remove:archive/chats/C1/tok-C1.json',
    'cleaned:C1:tok-C1',
    'put:archive/chats/C2/tok-C2.json',
    'finish:C2:u2,u3:tok-C2',
  ]);
});

test('a failed write is retried later and never finished', async () => {
  const { d, calls } = deps(new Set(), {
    put: async () => {
      throw new Error('r2 PUT 500');
    },
  });
  assert.deepEqual(await archiveChats([row('C1', 'u2', 'u1', [])], d), {
    archived: 0,
    failed: 1,
    withheld: 0,
  });
  assert.deepEqual(calls, []);
});

test('RV-01 a failed removal is never confirmed, so the cleanup list keeps it for cleanup-drafts', async () => {
  const { d, calls } = deps(new Set(['u1']), {
    remove: async () => {
      throw new Error('r2 DELETE 500');
    },
  });
  assert.deepEqual(await archiveChats([row('C1', 'u2', 'u1', [])], d), {
    archived: 0,
    failed: 1,
    withheld: 1,
  });
  assert.ok(!calls.some((c) => c.startsWith('cleaned:')));
});

test('IR3-01 a lost run removes exactly its own key and confirms its token', async () => {
  // Run 2 took the job over (new token, new key); run 1's finish is refused as lost.
  const { d, calls } = deps(new Set(), {
    finish: async (chatId, people, token) => {
      calls.push(`finish:${chatId}:${people.join(',')}:${token}`);
      return 'lost';
    },
  });
  assert.deepEqual(await archiveChats([row('C1', 'u2', 'u1', [])], d), {
    archived: 0,
    failed: 1,
    withheld: 0,
  });
  assert.deepEqual(calls, [
    'put:archive/chats/C1/tok-C1.json',
    'finish:C1:u1,u2:tok-C1',
    'remove:archive/chats/C1/tok-C1.json',
    'cleaned:C1:tok-C1',
  ]);
});

test('IR3-01 a row without a key is counted failed and nothing is written', async () => {
  const { d, calls } = deps(new Set());
  const keyless = { ...row('C1', 'u2', 'u1', []), key: undefined } as unknown as ArchiveRow;
  assert.deepEqual(await archiveChats([keyless, row('C2', 'u2', 'u1', [])], d), {
    archived: 1,
    failed: 1,
    withheld: 0,
  });
  assert.deepEqual(calls, ['put:archive/chats/C2/tok-C2.json', 'finish:C2:u1,u2:tok-C2']);
});

test('RV-01 no new write starts once the budget is spent (well inside the lease)', async () => {
  let clock = 0;
  const { d, calls } = deps(new Set(), {
    now: () => clock,
    budgetMs: 1_000,
    put: async (key) => {
      calls.push(`put:${key}`);
      clock += 600;
    },
  });
  const tally = await archiveChats(
    [row('C1', 'u2', 'u1', []), row('C2', 'u2', 'u1', []), row('C3', 'u2', 'u1', [])],
    d,
  );
  assert.equal(tally.archived, 2);
  assert.ok(!calls.includes('put:archive/chats/C3/tok-C3.json'));
});
