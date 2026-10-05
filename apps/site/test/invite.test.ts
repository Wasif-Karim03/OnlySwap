// R11-INVITE-01: /i/:code renderer (W05) and the /joined helpers (W06).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  joinedCopy,
  joinedHref,
  joinedTarget,
  joinWaitlist,
  schoolEmailProblem,
  SLUG_RE,
} from '../src/lib/client.ts';
import {
  inviteCsp,
  inviteProgress,
  renderInvite,
  storeLinks,
  type Invite,
} from '../src/lib/invite.ts';
// @ts-expect-error plain JS served from public/ (no types)
import * as page from '../public/invite.js';

const env = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_ANON_KEY: 'pk',
  TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
};
const URL_ = 'https://site/i/ABCD2345';

const waitlist: Invite = {
  first_name: 'Maya',
  campus_name: 'OSU',
  campus_slug: 'osu',
  campus_status: 'waitlist',
  members: 120,
  threshold: 500,
};

function fake(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body === null ? '' : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

/** Answers by URL suffix, for the multi-call join flow. */
function router(routes: Record<string, { status: number; body: unknown }>) {
  const calls: { url: string; body: unknown }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body ?? 'null')) });
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    const r = key ? routes[key]! : { status: 404, body: { message: 'nope' } };
    return new Response(r.body === null ? '' : JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

test('invite page: first name, campus, progress, noindex, OG, visitor IP forwarded', async () => {
  const { f, calls } = fake(200, waitlist);
  const res = await renderInvite('abcd2345', env, URL_, '198.51.100.7', f);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /<h1>Maya invited you to OnlySwap at OSU<\/h1>/);
  assert.match(html, /120 of 500 students at OSU/);
  assert.match(html, /aria-valuenow="24"/);
  assert.match(html, /name="robots" content="noindex"/);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  assert.match(html, /<meta property="og:title" content="Maya invited you to OnlySwap" \/>/);
  assert.match(html, /How it works/);
  assert.equal(calls[0]!.url, 'https://x.supabase.co/rest/v1/rpc/get_invite');
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { code: 'ABCD2345' });
  assert.equal(
    (calls[0]!.init.headers as Record<string, string>)['x-forwarded-for'],
    '198.51.100.7',
  );
});

test('OG tags carry no personal data beyond the first name', async () => {
  const { f } = fake(200, { ...waitlist, first_name: 'Maya' });
  const html = await (await renderInvite('ABCD2345', env, URL_, null, f)).text();
  const og = [...html.matchAll(/<meta (?:property|name)="(?:og|twitter):[^"]+" content="([^"]*)"/g)]
    .map((m) => m[1])
    .join(' ');
  assert.ok(og.includes('Maya'));
  assert.ok(!/@|\.edu/.test(og));
  assert.ok(!html.includes('og:image'));
});

test('escapes the first name and campus name', async () => {
  const { f } = fake(200, {
    ...waitlist,
    first_name: '<script>x</script>',
    campus_name: 'A&M "U"',
  });
  const html = await (await renderInvite('ABCD2345', env, URL_, null, f)).text();
  assert.ok(!html.includes('<script>x</script>'));
  assert.match(
    html,
    /&lt;script&gt;x&lt;\/script&gt; invited you to OnlySwap at A&amp;M &quot;U&quot;/,
  );
});

test('waitlist campus: the form carries the invite code, Turnstile and the form script', async () => {
  const { f } = fake(200, waitlist);
  const res = await renderInvite('abcd2345', env, URL_, null, f);
  const html = await res.text();
  assert.match(html, /<form id="waitlist"[^>]*data-invite="ABCD2345"/);
  assert.match(html, /data-url="https:\/\/x.supabase.co"/);
  assert.match(html, /class="cf-turnstile" data-sitekey="1x00000000000000000000AA"/);
  assert.match(html, /<script type="module" src="\/invite.js"><\/script>/);
  const csp = res.headers.get('content-security-policy')!;
  assert.match(csp, /script-src 'self' https:\/\/challenges.cloudflare.com/);
  assert.match(csp, /connect-src 'self' https:\/\/x.supabase.co/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('live campus: "open now", no waitlist form', async () => {
  const { f } = fake(200, { ...waitlist, campus_status: 'live', members: 640 });
  const html = await (await renderInvite('ABCD2345', env, URL_, null, f)).text();
  assert.match(html, /Open now at OSU/);
  assert.match(html, /aria-valuenow="100"/);
  assert.ok(!html.includes('id="waitlist"'));
  assert.ok(!html.includes('/invite.js'));
});

test('no store links when the URLs are unset; Play links carry the install referrer', async () => {
  const { f } = fake(200, waitlist);
  const html = await (await renderInvite('ABCD2345', env, URL_, null, f)).text();
  assert.ok(!html.includes('App Store</a>'));
  assert.ok(!html.includes('Google Play</a>'));
  assert.ok(!html.includes('/download'));

  const withStores = {
    ...env,
    PUBLIC_APP_STORE_URL: 'https://apps.apple.com/app/id123',
    PUBLIC_PLAY_STORE_URL: 'https://play.google.com/store/apps/details?id=app.onlyswap',
  };
  const { f: f2 } = fake(200, waitlist);
  const html2 = await (await renderInvite('ABCD2345', withStores, URL_, null, f2)).text();
  assert.match(html2, /href="https:\/\/apps.apple.com\/app\/id123">Get it on the App Store/);
  assert.match(html2, /referrer=invite%3DABCD2345">Get it on Google Play/);
  assert.deepEqual(storeLinks({ PUBLIC_APP_STORE_URL: 'https://a' }, 'X'), {
    appStore: 'https://a',
    playStore: undefined,
  });
});

test('null invite: friendly not-valid page, 404, no RPC for malformed codes', async () => {
  const { f } = fake(200, null);
  const res = await renderInvite('ABCD2345', env, URL_, null, f);
  assert.equal(res.status, 404);
  const html = await res.text();
  assert.match(html, /This invite link isn't valid/);
  assert.match(html, /name="robots" content="noindex"/);

  const bad = fake(200, waitlist);
  for (const code of ['ab', 'abc-def', '<x>', 'A'.repeat(17)]) {
    const r = await renderInvite(code, env, URL_, null, bad.f);
    assert.equal(r.status, 404);
  }
  assert.equal(bad.calls.length, 0);
});

test('rate limit and outage pages', async () => {
  const limited = await renderInvite(
    'ABCD2345',
    env,
    URL_,
    null,
    fake(400, { message: 'RATE_LIMITED:get_invite' }).f,
  );
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('cache-control'), 'no-store');
  const down = (async () => {
    throw new Error('offline');
  }) as unknown as typeof fetch;
  assert.equal((await renderInvite('ABCD2345', env, URL_, null, down)).status, 503);
});

test('invite progress caps at 100% and guards a zero threshold', () => {
  assert.deepEqual(inviteProgress({ ...waitlist, members: 700 }), {
    text: '700 of 500 students at OSU',
    percent: 100,
  });
  assert.equal(inviteProgress({ ...waitlist, threshold: 0 }).percent, 100);
  assert.match(inviteCsp({}), /connect-src 'self';/);
});

test('joinWaitlist sends the invite code only when given', async () => {
  const a = fake(200, { ok: true });
  await joinWaitlist({ url: 'https://x', key: 'k' }, 'A@OSU.edu ', 't', a.f, 'ABCD2345');
  assert.deepEqual(JSON.parse(String(a.calls[0]!.init.body)), {
    email: 'a@osu.edu',
    turnstile_token: 't',
    invite_code: 'ABCD2345',
  });
  const b = fake(200, { ok: true });
  await joinWaitlist({ url: 'https://x', key: 'k' }, 'a@osu.edu', 't', b.f);
  assert.ok(!('invite_code' in JSON.parse(String(b.calls[0]!.init.body))));
});

const progress = [
  { slug: 'osu', name: 'Ohio State', status: 'waitlist', members: 120, threshold: 500 },
  { slug: 'umich', name: 'Michigan', status: 'live', members: 900, threshold: 500 },
];

test('joinedTarget: waitlist campus → slug, live → name, unknown or failure → plain', async () => {
  const env2 = { url: 'https://x', key: 'k' };
  const r1 = router({
    '/lookup_school': {
      status: 200,
      body: { name: 'Ohio State', short_name: 'OSU', status: 'waitlist' },
    },
    '/public_campus_progress': { status: 200, body: progress },
  });
  const t1 = await joinedTarget(env2, 'a@osu.edu', r1.f);
  assert.deepEqual(t1, { kind: 'waitlist', slug: 'osu' });
  assert.equal(joinedHref(t1), '/joined?campus=osu');
  assert.deepEqual(r1.calls[0]!.body, { domain: 'osu.edu' });

  const r2 = router({
    '/lookup_school': { status: 200, body: { name: 'Michigan', short_name: 'UM', status: 'live' } },
    '/public_campus_progress': { status: 200, body: progress },
  });
  assert.deepEqual(await joinedTarget(env2, 'a@umich.edu', r2.f), {
    kind: 'live',
    name: 'Michigan',
  });

  const r3 = router({ '/lookup_school': { status: 200, body: null } });
  const t3 = await joinedTarget(env2, 'a@nowhere.edu', r3.f);
  assert.deepEqual(t3, { kind: 'unknown' });
  assert.equal(joinedHref(t3), '/joined');

  const r4 = router({ '/lookup_school': { status: 400, body: { message: 'RATE_LIMITED' } } });
  assert.deepEqual(await joinedTarget(env2, 'a@osu.edu', r4.f), { kind: 'unknown' });
});

test('/joined copy: campus progress, open campus, no campus; slug check', () => {
  const w = joinedCopy(progress[0] as never);
  assert.equal(w.heading, "You're on the list for Ohio State");
  assert.equal(w.line, '120 of 500 students at Ohio State. 380 more to open.');
  assert.equal(w.percent, 24);
  assert.match(w.next, /email you once when Ohio State opens/);
  const l = joinedCopy(progress[1] as never);
  assert.equal(l.heading, 'Michigan is open');
  assert.equal(l.percent, 100);
  const n = joinedCopy(null);
  assert.equal(n.heading, "You're on the list");
  assert.equal(n.percent, null);
  for (const c of [w, l, n]) {
    for (const s of [c.heading, c.line, c.next]) assert.ok(!s.includes('—'), s);
  }
  assert.ok(SLUG_RE.test('ohio-state'));
  for (const bad of ['', 'A', '../x', 'a b', 'a@b.edu', 'x'.repeat(64)])
    assert.ok(!SLUG_RE.test(bad));
});

test('public/invite.js matches the client helpers and joins with the code', async () => {
  for (const e of ['', 'a', 'a@b', 'a@gmail.com', ' A@OSU.EDU ', 'x@y.edu']) {
    assert.equal(page.schoolEmailProblem(e), schoolEmailProblem(e), e);
  }
  const r = router({
    '/waitlist-request': { status: 200, body: { ok: true } },
    '/lookup_school': {
      status: 200,
      body: { name: 'Ohio State', short_name: 'OSU', status: 'waitlist' },
    },
    '/public_campus_progress': { status: 200, body: progress },
  });
  const next = await page.join({ url: 'https://x', key: 'k' }, 'A@osu.edu', 'tok', 'ABCD2345', r.f);
  assert.equal(next, '/joined?campus=osu');
  assert.deepEqual(r.calls[0]!.body, {
    email: 'a@osu.edu',
    turnstile_token: 'tok',
    invite_code: 'ABCD2345',
  });
  const r2 = router({
    '/waitlist-request': { status: 200, body: { ok: true } },
    '/lookup_school': { status: 200, body: { name: 'Michigan', short_name: 'UM', status: 'live' } },
    '/public_campus_progress': { status: 200, body: progress },
  });
  assert.equal(
    await page.join({ url: 'https://x', key: 'k' }, 'a@umich.edu', 't', 'C', r2.f),
    'live',
  );
  const r3 = router({
    '/waitlist-request': { status: 400, body: { error: 'INVALID:turnstile_token' } },
  });
  await assert.rejects(
    page.join({ url: 'https://x', key: 'k' }, 'a@osu.edu', '', 'C', r3.f),
    /turnstile/,
  );
  assert.match(page.friendly('INVALID:turnstile_token'), /couldn't check/);
});
