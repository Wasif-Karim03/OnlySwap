// S15 function cores: T-FN-06 (support-request), T-SEC-14 (internal functions need
// the service key), revoke-sessions (P4-AUTH-18) and admin-change-email (P4-AUTH-19).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  handleAdminChangeEmail,
  handleRevokeSessions,
  isServiceCaller,
  safeEqual,
} from './internal.ts';
import { handleSupport, type SupportDeps } from './support.ts';

const KEY = 'service-key-123';
const USER = '11111111-1111-4111-8111-111111111111';
const post = (body: unknown, authorization: string | null = `Bearer ${KEY}`) => ({
  method: 'POST',
  authorization,
  body,
});

test('T-SEC-14 internal functions refuse anything but the service key', async () => {
  let calls = 0;
  const revoke = async () => {
    calls += 1;
    return 1;
  };
  for (const auth of [null, 'Bearer ', 'Bearer anon-key', `Bearer ${KEY}x`, KEY]) {
    assert.equal(
      (await handleRevokeSessions(post({ user_id: USER }, auth), { keys: [KEY], revoke })).status,
      401,
    );
    assert.equal(
      (
        await handleAdminChangeEmail(post({ user_id: USER, new_email: 'a@b.edu' }, auth), {
          keys: [KEY],
          updateEmail: async () => {},
          revoke,
        })
      ).status,
      401,
    );
  }
  assert.equal(calls, 0);
  assert.equal(isServiceCaller(`Bearer ${KEY}`, [undefined, '', KEY]), true);
  assert.equal(isServiceCaller('Bearer ', [undefined, '']), false);
  assert.equal(safeEqual('abc', 'abd'), false);
});

test('revoke-sessions deletes every session of the user', async () => {
  const seen: string[] = [];
  const res = await handleRevokeSessions(post({ user_id: USER }), {
    keys: [KEY],
    revoke: async (id) => {
      seen.push(id);
      return 3;
    },
  });
  assert.deepEqual(res, { status: 200, body: { ok: true, revoked: 3 } });
  assert.deepEqual(seen, [USER]);
  assert.equal(
    (await handleRevokeSessions(post({ user_id: 'x' }), { keys: [KEY], revoke: async () => 0 }))
      .status,
    400,
  );
  assert.equal(
    (
      await handleRevokeSessions(
        { method: 'GET', authorization: `Bearer ${KEY}`, body: null },
        { keys: [KEY], revoke: async () => 0 },
      )
    ).status,
    405,
  );
  const broken = await handleRevokeSessions(post({ user_id: USER }), {
    keys: [KEY],
    revoke: async () => {
      throw new Error('db down');
    },
  });
  assert.deepEqual(broken, { status: 500, body: { error: 'UNKNOWN' } });
});

test('admin-change-email updates the address, then signs the user out everywhere', async () => {
  const steps: string[] = [];
  const res = await handleAdminChangeEmail(
    post({ user_id: USER, new_email: ' A2@BuckeyeMail.osu.edu ' }),
    {
      keys: [KEY],
      updateEmail: async (id, email) => {
        steps.push(`update:${id}:${email}`);
      },
      revoke: async (id) => {
        steps.push(`revoke:${id}`);
        return 1;
      },
    },
  );
  assert.deepEqual(res, { status: 200, body: { ok: true } });
  assert.deepEqual(steps, [`update:${USER}:a2@buckeyemail.osu.edu`, `revoke:${USER}`]);
  const bad = await handleAdminChangeEmail(post({ user_id: USER, new_email: 'nope' }), {
    keys: [KEY],
    updateEmail: async () => {},
    revoke: async () => 0,
  });
  assert.deepEqual(bad, { status: 400, body: { error: 'INVALID:new_email' } });
  const failed = await handleAdminChangeEmail(post({ user_id: USER, new_email: 'a@b.edu' }), {
    keys: [KEY],
    updateEmail: async () => {
      throw new Error('email_exists');
    },
    revoke: async () => {
      steps.push('should not run');
      return 0;
    },
  });
  assert.equal(failed.status, 500);
  assert.equal(steps.includes('should not run'), false);
});

function support(over: Partial<SupportDeps> = {}) {
  const recorded: unknown[][] = [];
  const d: SupportDeps = {
    verifyTurnstile: async (t) => t === 'good',
    record: async (...args) => {
      recorded.push(args);
    },
    ...over,
  };
  return { d, recorded };
}
const app = (body: unknown) => ({ method: 'POST', origin: null, ip: '203.0.113.9', body });
const web = (body: unknown) => ({
  method: 'POST',
  origin: 'https://onlyswap.app',
  ip: '203.0.113.9',
  body,
});
const valid = { email: ' Me@Gmail.com ', topic: 'cant_access_email', body: ' I graduated. ' };

test('T-FN-06 support-request: stored from the app, Turnstile on the web', async () => {
  const { d, recorded } = support();
  assert.deepEqual(await handleSupport(app(valid), d), { status: 200, body: { ok: true } });
  assert.deepEqual(recorded[0], [
    'me@gmail.com',
    'cant_access_email',
    'I graduated.',
    '203.0.113.9',
  ]);
  assert.deepEqual(await handleSupport(web(valid), d), {
    status: 400,
    body: { error: 'INVALID:turnstile_token' },
  });
  assert.equal((await handleSupport(web({ ...valid, turnstile_token: 'good' }), d)).status, 200);
});

test('T-FN-06 support-request: validation, rate limit and failures', async () => {
  const { d } = support();
  const cases: [unknown, string][] = [
    [{ ...valid, email: 'x' }, 'INVALID:email'],
    [{ ...valid, topic: 'refund' }, 'INVALID:topic'],
    [{ ...valid, body: '   ' }, 'INVALID:body'],
    [{ ...valid, body: 'x'.repeat(2001) }, 'INVALID:body'],
  ];
  for (const [body, error] of cases) {
    assert.deepEqual(await handleSupport(app(body), d), { status: 400, body: { error } });
  }
  const limited = support({
    record: async () => {
      throw { message: 'RATE_LIMITED:ip:support:2027-01-01T13:00:00Z' };
    },
  });
  assert.equal((await handleSupport(app(valid), limited.d)).status, 429);
  const down = support({
    record: async () => {
      throw new Error('db down');
    },
  });
  assert.deepEqual(await handleSupport(app(valid), down.d), {
    status: 500,
    body: { error: 'UNKNOWN' },
  });
  assert.equal((await handleSupport({ ...app(valid), method: 'OPTIONS' }, d)).status, 204);
  assert.equal((await handleSupport({ ...app(valid), method: 'GET' }, d)).status, 405);
});
