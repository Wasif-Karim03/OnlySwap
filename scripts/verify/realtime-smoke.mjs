// Live check of private Realtime channels (ADR-004): a signed-in student
// receives the `inbox` ping on user:{uid} when someone offers on their listing.
//   ANON_KEY=... SERVICE_KEY=... node scripts/verify/realtime-smoke.mjs
import { createRequire } from 'node:module';

import { campusOf, check, done, key, listing, rpc, sleep, student, url } from './lib.mjs';

const req = createRequire(new URL('../../apps/admin/package.json', import.meta.url));
const { createClient } = req('@supabase/supabase-js');

const stamp = Date.now();
const seller = await student(`rt-seller-${stamp}@osu.edu`, 'Sam');
const buyer = await student(`rt-buyer-${stamp}@osu.edu`, 'Bea');
const campus = await campusOf(seller);
const id = await listing(seller, campus, { title: 'Realtime lamp' });

const sb = createClient(url, key, { auth: { persistSession: false } });
await sb.auth.setSession({ access_token: seller.token, refresh_token: 'unused' }).catch(() => {});
await sb.realtime.setAuth(seller.token);

let status = '';
let got = null;
const channel = sb
  .channel(`user:${seller.id}`, { config: { private: true } })
  .on('broadcast', { event: 'inbox' }, (m) => (got = m.payload))
  .subscribe((s, err) => {
    status = s;
    if (err) console.log('subscribe error:', err.message);
  });
for (let i = 0; i < 40 && status !== 'SUBSCRIBED'; i += 1) await sleep(250);
check(status === 'SUBSCRIBED', 'private user channel subscribes', status);

const offer = await rpc('make_offer', { listing_id: id, amount_cents: 1500 }, buyer.token);
check(offer.status === 200, 'buyer makes an offer', String(offer.status));
for (let i = 0; i < 40 && !got; i += 1) await sleep(250);
check(!!got, 'seller gets the inbox ping within 10 s', JSON.stringify(got));

// Someone else can't listen in.
const spy = createClient(url, key, { auth: { persistSession: false } });
await spy.realtime.setAuth(buyer.token);
let spyGot = null;
let spyStatus = '';
spy
  .channel(`user:${seller.id}`, { config: { private: true } })
  .on('broadcast', { event: 'inbox' }, (m) => (spyGot = m.payload))
  .subscribe((s) => (spyStatus = s));
for (let i = 0; i < 20 && !spyStatus; i += 1) await sleep(250);
await rpc(
  'make_offer',
  { listing_id: await listing(seller, campus, { title: 'Second lamp' }), amount_cents: 900 },
  buyer.token,
);
await sleep(3000);
check(!spyGot, 'another user gets nothing on that channel', spyStatus);

await sb.removeChannel(channel);
done();
