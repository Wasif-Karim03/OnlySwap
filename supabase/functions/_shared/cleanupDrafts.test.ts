// P5-SELL-07 cleanup-drafts: only the service key; folders deleted before the
// reservation is forgotten; a failed delete keeps the reservation for retry.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleCleanupDrafts, type CleanupDeps } from './cleanupDrafts.ts';

const KEY = 'service-key-123';
const post = (authorization: string | null = `Bearer ${KEY}`) => ({ method: 'POST', authorization });

function deps(over: Partial<CleanupDeps> = {}) {
  const deleted: string[] = [];
  const forgotten: string[][] = [];
  const d: CleanupDeps = {
    keys: [KEY],
    stale: async () => [
      { id: 'r1', campusIds: ['c1'] },
      { id: 'r2', campusIds: ['c1', 'c2'] },
    ],
    deletePrefix: async (prefix) => {
      deleted.push(prefix);
      return 2;
    },
    forget: async (ids) => {
      forgotten.push(ids);
      return ids.length;
    },
    ...over,
  };
  return { d, deleted, forgotten };
}

test('deletes each orphan folder, then forgets the reservations', async () => {
  const { d, deleted, forgotten } = deps();
  const res = await handleCleanupDrafts(post(), d);
  assert.deepEqual(res, { status: 200, body: { ok: true, drafts: 2, objects: 6, failed: 0 } });
  assert.deepEqual(deleted, ['c/c1/l/r1/', 'c/c1/l/r2/', 'c/c2/l/r2/']);
  assert.deepEqual(forgotten, [['r1', 'r2']]);
});

test('a failed delete keeps that reservation for the next run', async () => {
  const { d, forgotten } = deps({
    deletePrefix: async (prefix) => {
      if (prefix.includes('/r2/')) throw new Error('r2 down');
      return 1;
    },
  });
  const res = await handleCleanupDrafts(post(), d);
  assert.equal(res.status, 200);
  assert.equal(res.body.failed, 1);
  assert.deepEqual(forgotten, [['r1']]);
});

test('nothing stale: nothing forgotten', async () => {
  const { d, forgotten } = deps({ stale: async () => [] });
  assert.deepEqual(await handleCleanupDrafts(post(), d), {
    status: 200,
    body: { ok: true, drafts: 0, objects: 0, failed: 0 },
  });
  assert.equal(forgotten.length, 0);
});

test('T-SEC-14: only the service key; only POST; database errors are 500', async () => {
  const { d, deleted } = deps();
  for (const auth of [null, 'Bearer anon', KEY]) {
    assert.equal((await handleCleanupDrafts(post(auth), d)).status, 401);
  }
  assert.equal(deleted.length, 0);
  assert.equal((await handleCleanupDrafts({ method: 'GET', authorization: `Bearer ${KEY}` }, d)).status, 405);
  const broken = deps({
    stale: async () => {
      throw new Error('db down');
    },
  });
  assert.equal((await handleCleanupDrafts(post(), broken.d)).status, 500);
});
