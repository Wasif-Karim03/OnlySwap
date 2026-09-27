// T-FN-06 waitlist-request: Turnstile on web, IP limit, duplicate silent, uniform answer.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clientIp, handleWaitlist, turnstileVerify, type WaitlistDeps } from './waitlist.ts';

function deps(over: Partial<WaitlistDeps> = {}) {
  const recorded: { email: string; ip: string | null }[] = [];
  const d: WaitlistDeps = {
    verifyTurnstile: async (token) => token === 'good-token',
    record: async (email, ip) => {
      recorded.push({ email, ip });
    },
    ...over,
  };
  return { d, recorded };
}

const app = (body: unknown, method = 'POST') => ({ method, origin: null, ip: '203.0.113.5', body });
const web = (body: unknown) => ({
  method: 'POST',
  origin: 'https://onlyswap.app',
  ip: '203.0.113.5',
  body,
});

test('the app records a request without Turnstile and gets { ok: true }', async () => {
  const { d, recorded } = deps();
  const res = await handleWaitlist(app({ email: ' New@Unknown.EDU ' }), d);
  assert.deepEqual(res, { status: 200, body: { ok: true } });
  assert.deepEqual(recorded, [{ email: 'new@unknown.edu', ip: '203.0.113.5' }]);
});

test('a duplicate gets the same answer (the database ignores it)', async () => {
  const { d } = deps();
  const first = await handleWaitlist(app({ email: 'a@b.edu' }), d);
  const again = await handleWaitlist(app({ email: 'A@B.edu' }), d);
  assert.deepEqual(first, again);
});

test('the website must pass a valid Turnstile token', async () => {
  const { d, recorded } = deps();
  for (const body of [{ email: 'a@b.edu' }, { email: 'a@b.edu', turnstile_token: 'bad' }]) {
    assert.deepEqual(await handleWaitlist(web(body), d), {
      status: 400,
      body: { error: 'INVALID:turnstile_token' },
    });
  }
  assert.equal(recorded.length, 0);
  const ok = await handleWaitlist(web({ email: 'a@b.edu', turnstile_token: 'good-token' }), d);
  assert.equal(ok.status, 200);
  const broken = deps({
    verifyTurnstile: async () => {
      throw new Error('cloudflare down');
    },
  });
  assert.equal(
    (await handleWaitlist(web({ email: 'a@b.edu', turnstile_token: 'x' }), broken.d)).status,
    400,
  );
});

test('IP limit: the sixth request in the hour is 429', async () => {
  const { d } = deps({
    record: async () => {
      throw { message: 'RATE_LIMITED:ip:waitlist:2027-02-01T11:00:00Z' };
    },
  });
  assert.deepEqual(await handleWaitlist(app({ email: 'a@b.edu' }), d), {
    status: 429,
    body: { error: 'RATE_LIMITED:ip:waitlist:2027-02-01T11:00:00Z' },
  });
});

test('bad input, method and unexpected errors', async () => {
  const { d, recorded } = deps();
  for (const body of [
    {},
    { email: 'nope' },
    { email: 42 },
    null,
    { email: `${'a'.repeat(250)}@b.edu` },
  ]) {
    assert.deepEqual(await handleWaitlist(app(body), d), {
      status: 400,
      body: { error: 'INVALID:email' },
    });
  }
  assert.equal(recorded.length, 0);
  assert.equal((await handleWaitlist(app({}, 'GET'), d)).status, 405);
  assert.equal((await handleWaitlist(app({}, 'OPTIONS'), d)).status, 204);
  const down = deps({
    record: async () => {
      throw new Error('connection refused 10.0.0.1');
    },
  });
  assert.deepEqual(await handleWaitlist(app({ email: 'a@b.edu' }), down.d), {
    status: 500,
    body: { error: 'UNKNOWN' },
  });
});

test('client IP: cf-connecting-ip first, then x-forwarded-for', () => {
  const h = (m: Record<string, string>) => ({ get: (n: string) => m[n] ?? null });
  assert.equal(clientIp(h({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' })), '203.0.113.5');
  assert.equal(clientIp(h({ 'cf-connecting-ip': '198.51.100.2' })), '198.51.100.2');
  assert.equal(
    clientIp(h({ 'cf-connecting-ip': '198.51.100.2', 'x-forwarded-for': '1.1.1.1' })),
    '198.51.100.2',
  );
  assert.equal(clientIp(h({})), null);
});

test('turnstileVerify posts the secret, token and IP', async () => {
  let sent = '';
  const ok = await turnstileVerify('SECRET', 'TOKEN', '203.0.113.5', async (_url, init) => {
    sent = String(init.body);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });
  assert.equal(ok, true);
  assert.equal(sent, 'secret=SECRET&response=TOKEN&remoteip=203.0.113.5');
  const no = await turnstileVerify('S', 'T', null, async () => new Response('{"success":false}'));
  assert.equal(no, false);
  const err = await turnstileVerify('S', 'T', null, async () => new Response('', { status: 500 }));
  assert.equal(err, false);
});
