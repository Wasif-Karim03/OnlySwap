// T-FN-05 delete-account (node --experimental-strip-types --test).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleDeleteAccount, type DeleteDeps, type Prepared } from './deleteAccount.ts';

function deps(over: Partial<DeleteDeps> = {}) {
  const calls: string[] = [];
  const d: DeleteDeps = {
    userIdFromToken: async (t) => (t === 'good' ? 'u1' : null),
    prepare: async (_u, underage): Promise<Prepared> => {
      calls.push(`prepare:${underage}`);
      return { email: underage ? null : 'a@osu.edu', r2_prefixes: ['c/x/u/u1/', 'c/x/l/L1/'] };
    },
    deleteUser: async (u) => void calls.push(`deleteUser:${u}`),
    deleteR2Prefix: async (p) => void calls.push(`r2:${p}`),
    ...over,
  };
  return { d, calls };
}

const req = (body: unknown, auth: string | null = 'Bearer good', method = 'POST') => ({
  method,
  authorization: auth,
  body,
});

test('T-FN-05 deletes every R2 prefix, then the auth user', async () => {
  const { d, calls } = deps();
  const res = await handleDeleteAccount(req({ confirm: 'DELETE' }), d);
  assert.deepEqual(res, { status: 200, body: { ok: true } });
  assert.deepEqual(calls, ['prepare:false', 'r2:c/x/u/u1/', 'r2:c/x/l/L1/', 'deleteUser:u1']);
});

test('T-FN-05 underage mode needs no confirmation and tells the server (no email)', async () => {
  const { d, calls } = deps();
  const res = await handleDeleteAccount(req({ mode: 'underage' }), d);
  assert.equal(res.status, 200);
  assert.equal(calls[0], 'prepare:true');
});

test('a normal deletion needs confirm DELETE', async () => {
  const { d, calls } = deps();
  for (const body of [{}, { confirm: 'delete' }, null, 'DELETE']) {
    const res = await handleDeleteAccount(req(body), d);
    assert.deepEqual(res, { status: 400, body: { error: 'INVALID:confirm' } });
  }
  assert.deepEqual(calls, []);
});

test('no or bad token is 401 and touches nothing', async () => {
  const { d, calls } = deps();
  assert.equal((await handleDeleteAccount(req({ confirm: 'DELETE' }, null), d)).status, 401);
  assert.equal(
    (await handleDeleteAccount(req({ confirm: 'DELETE' }, 'Bearer bad'), d)).status,
    401,
  );
  assert.equal(
    (await handleDeleteAccount(req({ confirm: 'DELETE' }, 'Basic good'), d)).status,
    401,
  );
  assert.deepEqual(calls, []);
});

test('only POST', async () => {
  const { d } = deps();
  assert.equal(
    (await handleDeleteAccount(req({ confirm: 'DELETE' }, 'Bearer good', 'GET'), d)).status,
    405,
  );
});

test('server error codes map to HTTP statuses and stop before deleting', async () => {
  for (const [message, status] of [
    ['FORBIDDEN', 403],
    ['RATE_LIMITED:delete_account:2026-09-27T00:00:00Z', 429],
    ['NOT_FOUND', 404],
  ] as const) {
    const { d, calls } = deps({
      prepare: async () => {
        throw { message };
      },
    });
    const res = await handleDeleteAccount(req({ mode: 'underage' }), d);
    assert.deepEqual(res, { status, body: { error: message } });
    assert.deepEqual(calls, []);
  }
});

test('an unexpected failure is a plain 500 without details', async () => {
  const { d } = deps({
    prepare: async () => {
      throw new Error('connection refused to 10.0.0.1');
    },
  });
  assert.deepEqual(await handleDeleteAccount(req({ confirm: 'DELETE' }), d), {
    status: 500,
    body: { error: 'UNKNOWN' },
  });
});

test('without the R2 dependency (before P5-MEDIA-04) the account is still deleted', async () => {
  const { d, calls } = deps({ deleteR2Prefix: undefined });
  const res = await handleDeleteAccount(req({ confirm: 'DELETE' }), d);
  assert.equal(res.status, 200);
  assert.deepEqual(calls, ['prepare:false', 'deleteUser:u1']);
});

test('T-INT-DEL-03 (core): reported photos are copied to evidence before anything is deleted', async () => {
  const calls: string[] = [];
  const { d } = deps({
    prepare: async () => ({
      email: 'a@osu.edu',
      r2_prefixes: ['c/x/u/u1/', 'c/x/l/L1/'],
      evidence: [{ report_id: 'R1', key: 'c/x/l/L1/p_full.webp' }],
    }),
    copyToPrivate: async (from, to) => void calls.push(`copy:${from}->${to}`),
    recordMoves: async (moves) => void calls.push(`record:${JSON.stringify(moves)}`),
    deleteR2Prefix: async (p) => void calls.push(`r2:${p}`),
    deleteUser: async (u) => void calls.push(`deleteUser:${u}`),
  });
  const res = await handleDeleteAccount(req({ confirm: 'DELETE' }), d);
  assert.equal(res.status, 200);
  assert.deepEqual(calls, [
    'copy:c/x/l/L1/p_full.webp->evidence/R1/p_full.webp',
    'record:[{"report_id":"R1","from":"c/x/l/L1/p_full.webp","to":"evidence/R1/p_full.webp"}]',
    'r2:c/x/u/u1/',
    'r2:c/x/l/L1/',
    'deleteUser:u1',
  ]);
});

test('a failed evidence copy stops before deleting any media or the account', async () => {
  const calls: string[] = [];
  const { d } = deps({
    prepare: async () => ({
      email: null,
      r2_prefixes: ['c/x/u/u1/'],
      evidence: [{ report_id: 'R1', key: 'c/x/l/L1/p_full.webp' }],
    }),
    copyToPrivate: async () => {
      throw new Error('r2 PUT 500');
    },
    recordMoves: async () => void calls.push('record'),
    deleteR2Prefix: async () => void calls.push('r2'),
    deleteUser: async () => void calls.push('deleteUser'),
  });
  assert.deepEqual(await handleDeleteAccount(req({ confirm: 'DELETE' }), d), {
    status: 500,
    body: { error: 'UNKNOWN' },
  });
  assert.deepEqual(calls, []);
});
