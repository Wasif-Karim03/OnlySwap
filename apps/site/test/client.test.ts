// P13-WEB-02/04/05 browser helpers.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  campusProgress,
  deleteAccount,
  friendly,
  joinWaitlist,
  progressLine,
  schoolEmailProblem,
  sendCode,
  sendSupport,
  verifyCode,
} from '../src/lib/client.ts';

const env = { url: 'https://x.supabase.co', key: 'sb_publishable_test' };

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body === undefined ? '' : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

test('campus progress calls the public RPC with the publishable key', async () => {
  const { f, calls } = fakeFetch(200, [
    { slug: 'osu', name: 'Ohio State', status: 'waitlist', members: 250, threshold: 500 },
  ]);
  const rows = await campusProgress(env, f);
  assert.equal(rows[0]!.slug, 'osu');
  assert.equal(calls[0]!.url, 'https://x.supabase.co/rest/v1/rpc/public_campus_progress');
  assert.equal((calls[0]!.init.headers as Record<string, string>).apikey, 'sb_publishable_test');
});

test('progress line', () => {
  assert.deepEqual(
    progressLine({ slug: 'a', name: 'A', status: 'waitlist', members: 250, threshold: 500 }),
    {
      text: '250 of 500 students at A',
      percent: 50,
    },
  );
  assert.equal(
    progressLine({ slug: 'a', name: 'A', status: 'waitlist', members: 900, threshold: 500 })
      .percent,
    100,
  );
  assert.equal(
    progressLine({ slug: 'a', name: 'A', status: 'live', members: 9, threshold: 500 }).text,
    'Open at A',
  );
});

test('school email check', () => {
  assert.equal(schoolEmailProblem('kim@osu.edu'), null);
  assert.match(schoolEmailProblem('kim@gmail.com')!, /\.edu/);
  assert.match(schoolEmailProblem('nope')!, /school email/);
});

test('waitlist and support send the Turnstile token', async () => {
  const w = fakeFetch(200, { ok: true });
  await joinWaitlist(env, ' Kim@OSU.edu ', 'tok', w.f);
  assert.deepEqual(JSON.parse(String(w.calls[0]!.init.body)), {
    email: 'kim@osu.edu',
    turnstile_token: 'tok',
  });
  const s = fakeFetch(200, { ok: true });
  await sendSupport(
    env,
    { email: 'kim@osu.edu', topic: 'bug', body: ' app crashed ', turnstileToken: 'tok' },
    s.f,
  );
  assert.equal(JSON.parse(String(s.calls[0]!.init.body)).body, 'app crashed');
  await assert.rejects(
    joinWaitlist(env, 'kim@osu.edu', '', fakeFetch(400, { error: 'INVALID:turnstile_token' }).f),
    /turnstile/,
  );
});

test('web deletion: code, verify, delete with the user token (E2E-W04 path)', async () => {
  const a = fakeFetch(200, {});
  await sendCode(env, 'kim@osu.edu', a.f);
  assert.equal(JSON.parse(String(a.calls[0]!.init.body)).create_user, false);
  const b = fakeFetch(200, { access_token: 'user-jwt' });
  assert.equal(await verifyCode(env, 'kim@osu.edu', '123456', b.f), 'user-jwt');
  await assert.rejects(verifyCode(env, 'kim@osu.edu', '1', fakeFetch(200, {}).f), /INVALID_CODE/);
  const c = fakeFetch(200, { ok: true });
  await deleteAccount(env, 'user-jwt', c.f);
  assert.equal(
    (c.calls[0]!.init.headers as Record<string, string>).authorization,
    'Bearer user-jwt',
  );
  assert.deepEqual(JSON.parse(String(c.calls[0]!.init.body)), { confirm: 'DELETE' });
});

test('friendly errors have no em dashes', () => {
  for (const code of [
    'RATE_LIMITED',
    'INVALID:turnstile_token',
    'INVALID_CODE',
    'otp_disabled',
    'INVALID:email',
    'x',
  ]) {
    const m = friendly(new Error(code));
    assert.ok(m.length > 5);
    assert.ok(!m.includes(String.fromCharCode(0x2014)));
  }
});
