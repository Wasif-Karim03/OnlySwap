// P13-WEB-06 share pages: E2E-W02 (OG meta + blurred wall) and E2E-W03 (status,
// expired token) at the unit level.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  clientIp,
  esc,
  meetupStatusLine,
  money,
  renderListing,
  renderMeetup,
  type MeetupShare,
} from '../src/lib/share.ts';

const env = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_ANON_KEY: 'pk',
  MEDIA_URL: 'https://media.example',
};
const ID = '00000000-0000-4000-8000-0000000000c1';

function fake(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body === null ? '' : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

test('listing card: OG tags, image, noindex, escaped title, visitor IP forwarded', async () => {
  const { f, calls } = fake(200, {
    title: 'Lamp <b>',
    price_cents: 1500,
    kind: 'sale',
    campus_name: 'OSU',
    share_image_path: `share/${ID}.jpg`,
  });
  const res = await renderListing(ID, env, `https://site/l/${ID}`, '198.51.100.7', f);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /<meta property="og:title" content="Lamp &lt;b&gt; · \$15" \/>/);
  assert.match(
    html,
    /og:image" content="https:\/\/media.example\/share\/00000000-0000-4000-8000-0000000000c1.jpg"/,
  );
  assert.match(html, /class="blur"/);
  assert.match(html, /name="robots" content="noindex"/);
  assert.ok(!html.includes('<b>'));
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  assert.equal(
    (calls[0]!.init.headers as Record<string, string>)['x-forwarded-for'],
    '198.51.100.7',
  );
  assert.equal(calls[0]!.url, 'https://x.supabase.co/rest/v1/rpc/get_listing_public_card');
});

test('Safari app banner when the App Store id is set', async () => {
  const card = {
    title: 'Lamp',
    price_cents: 0,
    kind: 'free',
    campus_name: 'OSU',
    share_image_path: null,
  };
  const res = await renderListing(
    ID,
    { ...env, APPLE_APP_ID: '123456789' },
    `https://site/l/${ID}`,
    null,
    fake(200, card).f,
  );
  const html = await res.text();
  assert.match(
    html,
    /apple-itunes-app" content="app-id=123456789, app-argument=https:\/\/site\/l\//,
  );
  assert.match(html, /Lamp · Free/);
});

test('listing not shared, sold or malformed id: 404 page', async () => {
  const res = await renderListing(ID, env, 'u', null, fake(200, null).f);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /isn't available/);
  const bad = fake(200, {});
  assert.equal((await renderListing('../etc', env, 'u', null, bad.f)).status, 404);
  assert.equal(bad.calls.length, 0);
});

test('rate limit shows a 429 page', async () => {
  const res = await renderListing(
    ID,
    env,
    'u',
    null,
    fake(400, { message: 'RATE_LIMITED:ip:listing_card' }).f,
  );
  assert.equal(res.status, 429);
});

const meetup: MeetupShare = {
  a_first: 'Kim',
  b_first: 'Ben',
  spot_name: 'Thompson Library',
  spot_lat: 40,
  spot_lng: -83,
  starts_at: '2027-03-10T17:00:00Z',
  a_here: true,
  b_here: false,
  late_minutes: null,
  status: 'confirmed',
};

test('meetup page: status, refresh, no-store, directions, first names only', async () => {
  const res = await renderMeetup('0123456789abcdef012345', env, 'u', null, fake(200, meetup).f);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(html, /http-equiv="refresh" content="60"/);
  assert.match(html, /Kim is meeting Ben/);
  assert.match(html, /Kim is there. Ben hasn&#39;t checked in yet./);
  assert.match(html, /maps.google.com\/\?q=40%2C-83/);
  assert.match(html, /<time datetime="2027-03-10T17:00:00Z">/);
});

test('expired or unknown meetup token shows the expired message (E2E-W03)', async () => {
  const res = await renderMeetup(
    '0123456789abcdef012345',
    env,
    'u',
    null,
    fake(400, { message: 'NOT_FOUND' }).f,
  );
  assert.equal(res.status, 404);
  assert.match(await res.text(), /expired/);
  assert.equal((await renderMeetup('short', env, 'u', null, fake(200, meetup).f)).status, 404);
});

test('status lines', () => {
  assert.equal(meetupStatusLine({ ...meetup, status: 'cancelled' }), 'This meetup was cancelled.');
  assert.equal(
    meetupStatusLine({ ...meetup, a_here: true, b_here: true }),
    'Kim and Ben are both there.',
  );
  assert.equal(
    meetupStatusLine({ ...meetup, a_here: false, late_minutes: 10 }),
    'Running about 10 minutes late.',
  );
  assert.match(meetupStatusLine({ ...meetup, status: 'proposed' }), /hasn't confirmed/);
});

test('helpers', () => {
  assert.equal(esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  assert.equal(money(0), 'Free');
  assert.equal(money(1250), '$12.50');
  assert.equal(clientIp(new Headers({ 'cf-connecting-ip': '1.2.3.4' })), '1.2.3.4');
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': '5.6.7.8, 9.9.9.9' })), '5.6.7.8');
});
