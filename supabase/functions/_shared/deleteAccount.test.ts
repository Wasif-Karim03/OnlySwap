// T-FN-05 delete-account (node --experimental-strip-types --test).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { purgeKeys } from './cachePurge.ts';
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
    copyToPrivate: async () => true,
    privateExists: async () => false,
    recordMoves: async () => {},
    deleteArchive: async () => {},
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

test('IR-03 without R2 nothing is prepared, confirmed or deleted', async () => {
  for (const missing of [
    'deleteR2Prefix',
    'copyToPrivate',
    'privateExists',
    'recordMoves',
    'deleteArchive',
  ] as const) {
    const logs: string[] = [];
    const { d, calls } = deps({
      [missing]: undefined,
      confirmMedia: async () => void calls.push('confirm'),
      log: (event) => void logs.push(event),
    });
    for (const body of [{ confirm: 'DELETE' }, { mode: 'underage' }]) {
      assert.deepEqual(await handleDeleteAccount(req(body), d), {
        status: 500,
        body: { error: 'UNKNOWN' },
      });
    }
    assert.deepEqual(calls, [], `${missing}: no prepare, no confirm, no deleteUser`);
    assert.deepEqual(logs, [
      'delete_account.r2_not_configured',
      'delete_account.r2_not_configured',
    ]);
  }
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

test('B-03: archived chats are deleted from the private bucket before the auth user', async () => {
  const { d, calls } = deps({
    prepare: async () => ({
      email: 'a@osu.edu',
      r2_prefixes: ['c/x/u/u1/'],
      archives: ['archive/chats/C1.json', 'archive/chats/C2.json'],
    }),
    deleteArchive: async (k) => void calls.push(`archive:${k}`),
  });
  const res = await handleDeleteAccount(req({ confirm: 'DELETE' }), d);
  assert.equal(res.status, 200);
  assert.deepEqual(calls, [
    'r2:c/x/u/u1/',
    'archive:archive/chats/C1.json',
    'archive:archive/chats/C2.json',
    'deleteUser:u1',
  ]);
});

test('B-03: a failed archive delete stops before the account is deleted', async () => {
  const { d, calls } = deps({
    prepare: async () => ({ email: null, r2_prefixes: [], archives: ['archive/chats/C1.json'] }),
    deleteArchive: async () => {
      throw new Error('r2 DELETE 500');
    },
  });
  const res = await handleDeleteAccount(req({ confirm: 'DELETE' }), d);
  assert.deepEqual(res, { status: 500, body: { error: 'UNKNOWN' } });
  assert.ok(!calls.some((c) => c.startsWith('deleteUser')));
});

// LR-01/LR-02 (0246): purge after each prefix, confirm the manifest, then delete the auth user.
test('LR-02 each prefix is purged right after it is deleted, then the manifest is confirmed', async () => {
  const logs: string[] = [];
  const { d, calls } = deps({
    prepare: async () => ({
      email: 'a@osu.edu',
      r2_prefixes: ['c/x/l/L1/', 'c/x/quad/Q1/'],
      evidence: [{ report_id: 'R1', key: 'c/x/l/L1/p_full.webp' }],
      archives: ['archive/chats/C1.json'],
    }),
    copyToPrivate: async (from) => void calls.push(`copy:${from}`),
    recordMoves: async () => void calls.push('record'),
    deleteR2Prefix: async (p) => {
      calls.push(`r2:${p}`);
      return [`${p}a_full.webp`, `${p}a_thumb.webp`];
    },
    purge: async (keys) => void calls.push(`purge:${keys.join(',')}`),
    deleteArchive: async (k) => void calls.push(`archive:${k}`),
    confirmMedia: async (u) => void calls.push(`confirm:${u}`),
    log: (event, data) => void logs.push(`${event}:${JSON.stringify(data ?? {})}`),
  });
  const res = await handleDeleteAccount(req({ confirm: 'DELETE' }), d);
  assert.deepEqual(res, { status: 200, body: { ok: true } });
  assert.deepEqual(calls, [
    'copy:c/x/l/L1/p_full.webp',
    'record',
    'r2:c/x/l/L1/',
    'purge:c/x/l/L1/a_full.webp,c/x/l/L1/a_thumb.webp',
    'r2:c/x/quad/Q1/',
    'purge:c/x/quad/Q1/a_full.webp,c/x/quad/Q1/a_thumb.webp',
    'archive:archive/chats/C1.json',
    'confirm:u1',
    'deleteUser:u1',
  ]);
  // Counts only: no keys or ids in logs (SECURITY §6).
  assert.deepEqual(logs, ['delete_account.done:{"underage":false,"prefixes":2,"purged":4}']);
});

test('LR-02 a purge failure is logged and the deletion goes on', async () => {
  const logs: string[] = [];
  const { d, calls } = deps({
    deleteR2Prefix: async (p) => {
      calls.push(`r2:${p}`);
      return [`${p}x.webp`];
    },
    purge: async () => {
      throw new Error('purge 403');
    },
    confirmMedia: async () => void calls.push('confirm'),
    log: (event) => void logs.push(event),
  });
  const res = await handleDeleteAccount(req({ confirm: 'DELETE' }), d);
  assert.equal(res.status, 200);
  assert.deepEqual(calls, [
    'prepare:false',
    'r2:c/x/u/u1/',
    'r2:c/x/l/L1/',
    'confirm',
    'deleteUser:u1',
  ]);
  assert.deepEqual(logs, [
    'delete_account.purge_failed',
    'delete_account.purge_failed',
    'delete_account.done',
  ]);
});

test('R3-03 a later prefix failure keeps the earlier purge and returns 500 before confirming', async () => {
  const purged: string[][] = [];
  const { d, calls } = deps({
    deleteR2Prefix: async (p) => {
      if (p === 'c/x/l/L1/') throw new Error('r2 GET 500');
      calls.push(`r2:${p}`);
      return [`${p}avatar_1.webp`];
    },
    purge: async (keys) => void purged.push(keys),
    confirmMedia: async () => void calls.push('confirm'),
  });
  const res = await handleDeleteAccount(req({ confirm: 'DELETE' }), d);
  assert.deepEqual(res, { status: 500, body: { error: 'UNKNOWN' } });
  assert.deepEqual(purged, [['c/x/u/u1/avatar_1.webp']]);
  assert.deepEqual(calls, ['prepare:false', 'r2:c/x/u/u1/']);
});

test('a failed confirmation stops before the auth user is deleted', async () => {
  const logs: string[] = [];
  const { d, calls } = deps({
    confirmMedia: async () => {
      throw new Error('connection reset');
    },
    log: (event) => void logs.push(event),
  });
  const res = await handleDeleteAccount(req({ confirm: 'DELETE' }), d);
  assert.deepEqual(res, { status: 500, body: { error: 'UNKNOWN' } });
  assert.ok(!calls.some((c) => c.startsWith('deleteUser')));
  assert.deepEqual(logs, ['delete_account.confirm_failed']);
});

test('LR-02 chat keys are skipped when the purge goes to Cloudflare', async () => {
  const sent: string[][] = [];
  const cfg = { zoneId: 'Z', token: 't', mediaUrl: 'https://media.test' };
  const { d } = deps({
    prepare: async () => ({ email: null, r2_prefixes: ['c/x/chat/C1/k_full.webp', 'c/x/u/u1/'] }),
    deleteR2Prefix: async (p) => (p.endsWith('/') ? [`${p}avatar_1.webp`] : [p]),
    purge: (keys) =>
      purgeKeys(cfg, keys, async (_url, init) => {
        sent.push((JSON.parse(String(init?.body)) as { files: string[] }).files);
        return Response.json({ success: true });
      }),
  });
  assert.equal((await handleDeleteAccount(req({ confirm: 'DELETE' }), d)).status, 200);
  assert.deepEqual(sent, [['https://media.test/c/x/u/u1/avatar_1.webp']]);
});

test('IR-05 a prefix that fails part way purges the keys it already deleted, then stops', async () => {
  const purged: string[][] = [];
  const logs: string[] = [];
  const { d, calls } = deps({
    deleteR2Prefix: async (p) => {
      calls.push(`r2:${p}`);
      // What r2.deleteUnder throws when the second DELETE fails.
      throw Object.assign(new Error('r2 DELETE 500'), { deleted: [`${p}a_full.webp`] });
    },
    purge: async (keys) => void purged.push(keys),
    confirmMedia: async () => void calls.push('confirm'),
    log: (event, data) => void logs.push(`${event}:${JSON.stringify(data ?? {})}`),
  });
  const res = await handleDeleteAccount(req({ confirm: 'DELETE' }), d);
  assert.deepEqual(res, { status: 500, body: { error: 'UNKNOWN' } });
  assert.deepEqual(purged, [['c/x/u/u1/a_full.webp']]);
  assert.deepEqual(calls, ['prepare:false', 'r2:c/x/u/u1/']);
  assert.deepEqual(logs, ['delete_account.media_failed:{"detail":"r2 DELETE 500"}']);
});

test('IR-02 a gone source is kept when its private copy exists, else listed as missing', async () => {
  const moves: unknown[] = [];
  const { d } = deps({
    prepare: async () => ({
      email: null,
      r2_prefixes: [],
      evidence: [
        { report_id: 'R1', key: 'c/x/chat/C1/a_full.webp' },
        { report_id: 'R1', key: 'c/x/chat/C1/b_full.webp' },
        { report_id: 'R1', key: 'c/x/chat/C1/c_full.webp' },
      ],
    }),
    copyToPrivate: async (from) => from.endsWith('a_full.webp'),
    privateExists: async (to) => to === 'evidence/R1/b_full.webp',
    recordMoves: async (m) => void moves.push(...m),
  });
  assert.equal((await handleDeleteAccount(req({ confirm: 'DELETE' }), d)).status, 200);
  assert.deepEqual(moves, [
    { report_id: 'R1', from: 'c/x/chat/C1/a_full.webp', to: 'evidence/R1/a_full.webp' },
    { report_id: 'R1', from: 'c/x/chat/C1/b_full.webp', to: 'evidence/R1/b_full.webp' },
    {
      report_id: 'R1',
      from: 'c/x/chat/C1/c_full.webp',
      to: 'evidence/R1/c_full.webp',
      missing: true,
    },
  ]);
});

test('IR-02 two deletions sharing a report: the second still records the complete set', async () => {
  // One bucket pair shared by both requests. Report R1 holds A's photo and
  // B's; both deletions were prepared before either moved anything.
  const media = new Set(['c/x/u/A/a_full.webp', 'c/x/u/B/b_full.webp']);
  const priv = new Set<string>();
  const recorded: { report_id: string; to: string; missing?: true }[][] = [];
  const evidence = [
    { report_id: 'R1', key: 'c/x/u/A/a_full.webp' },
    { report_id: 'R1', key: 'c/x/u/B/b_full.webp' },
  ];
  const deletion = (user: string) =>
    deps({
      userIdFromToken: async () => user,
      prepare: async () => ({ email: null, r2_prefixes: [`c/x/u/${user}/`], evidence }),
      copyToPrivate: async (from, to) => {
        if (!media.has(from)) return false;
        priv.add(to);
        return true;
      },
      privateExists: async (to) => priv.has(to),
      recordMoves: async (m) => void recorded.push(m),
      deleteR2Prefix: async (p) => {
        const gone = [...media].filter((k) => k.startsWith(p));
        for (const k of gone) media.delete(k);
        return gone;
      },
    }).d;
  assert.equal((await handleDeleteAccount(req({ confirm: 'DELETE' }), deletion('A'))).status, 200);
  assert.equal((await handleDeleteAccount(req({ confirm: 'DELETE' }), deletion('B'))).status, 200);
  assert.equal(recorded.length, 2);
  // A's original was gone for the second deletion, but its private copy was
  // found, so nothing is reported missing.
  assert.deepEqual(
    recorded[1]?.map((m) => `${m.to}${m.missing ? ':missing' : ''}`),
    ['evidence/R1/a_full.webp', 'evidence/R1/b_full.webp'],
  );
});
