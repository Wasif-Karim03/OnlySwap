// Live Sell step 3/4 checks against local Supabase (S17: P5-SELL-04, 05, 07).
//   ANON_KEY=... SERVICE_KEY=... node scripts/verify/post-smoke.mjs
import { readFileSync } from 'node:fs';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const key = process.env.ANON_KEY;
const service = process.env.SERVICE_KEY;
const mailpit = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
if (!key || !service) {
  console.error('ANON_KEY and SERVICE_KEY must be set');
  process.exit(2);
}

let failed = 0;
const check = (ok, name, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = async (res) => {
  try {
    return await res.json();
  } catch {
    return {};
  }
};
const post = (path, body, token) =>
  fetch(`${url}${path}`, {
    method: 'POST',
    headers: {
      apikey: key,
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
const rpc = async (fn, body, token) => {
  const res = await post(`/rest/v1/rpc/${fn}`, body, token);
  return { status: res.status, body: await json(res) };
};
const ok2xx = (s) => s >= 200 && s < 300;

async function codeSignIn(email) {
  const before = Date.now();
  await post('/auth/v1/otp', { email, create_user: true });
  let code;
  for (let i = 0; i < 20 && !code; i += 1) {
    await sleep(500);
    const res = await fetch(
      `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    if (!res.ok) continue;
    const msg = (await res.json()).messages?.find((m) => Date.parse(m.Created) >= before - 2000);
    code = msg?.Subject?.match(/\b(\d{6})\b/)?.[1];
  }
  const v = code
    ? await json(await post('/auth/v1/verify', { type: 'email', email, token: code }))
    : {};
  if (!v.access_token) throw new Error(`sign-in failed for ${email}`);
  return { token: v.access_token, id: v.user.id };
}
async function student(email, name) {
  const s = await codeSignIn(email);
  const rules = (await rpc('get_app_config', {}, s.token)).body.rules_version;
  await rpc('confirm_age', { method: 'os_signal', is_adult: true }, s.token);
  await rpc('update_profile', { first_name: name }, s.token);
  await rpc('accept_rules', { version: rules }, s.token);
  return s;
}

const webp = new Uint8Array(
  readFileSync(new URL('../../apps/mobile/src/lib/__fixtures__/clean.webp', import.meta.url)),
);

async function uploadPhoto(token, listingId) {
  const req = await post(
    '/functions/v1/upload-url',
    {
      kind: 'listing',
      target_id: listingId,
      files: [
        { idx: 0, variant: 'full', type: 'image/webp', size: webp.length },
        { idx: 0, variant: 'thumb', type: 'image/webp', size: webp.length },
      ],
    },
    token,
  );
  const uploads = (await json(req)).uploads ?? [];
  for (const u of uploads) {
    await fetch(u.url, { method: 'PUT', headers: { 'content-type': 'image/webp' }, body: webp });
  }
  const full = uploads.find((u) => u.variant === 'full')?.key;
  const thumb = uploads.find((u) => u.variant === 'thumb')?.key;
  return {
    status: req.status,
    photo: full && thumb ? { path: full, thumb_path: thumb, width: 8, height: 8 } : null,
  };
}

// A seller posts with meetup spots, uploads the share card and records it;
// the card is publicly readable (what /l/{id} will show). A draft photo from
// a reservation that was never posted is removed by cleanup-drafts after 24 h.
const jpeg = new Uint8Array(
  readFileSync(new URL('../../apps/mobile/src/lib/__fixtures__/clean.jpg', import.meta.url)),
);
const admin = (path, init = {}) =>
  fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: service,
      authorization: `Bearer ${service}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });
const publicUrl = (k) => `${url}/storage/v1/object/public/onlyswap-media/${k}`;

const run = Date.now();
const seller = await student(`poster${run}@osu.edu`, 'Pia');

// P5-SELL-04: spots saved on the listing
const spots = await json(
  await fetch(`${url}/rest/v1/safe_spots?select=id,name&order=sort`, {
    headers: { apikey: key, authorization: `Bearer ${seller.token}` },
  }),
);
check(
  Array.isArray(spots) && spots.length >= 2,
  'the campus meetup spots load for step 3',
  `${spots.length ?? 0} spots`,
);
const id = (await rpc('reserve_listing_id', {}, seller.token)).body;
const up = await uploadPhoto(seller.token, id);
const posted = await rpc(
  'create_listing',
  {
    id,
    title: 'Desk lamp',
    category_id: 1,
    condition: 'good',
    price_cents: 1200,
    photos: [up.photo],
    meet_spot_ids: [spots[0].id, spots[1].id],
    meet_note: 'Lobby of Morrill Tower',
    availability: ['Evenings', 'Weekends'],
  },
  seller.token,
);
check(
  ok2xx(posted.status) &&
    JSON.stringify(posted.body.meet_spot_ids) ===
      JSON.stringify([spots[0].id, spots[1].id].sort()) &&
    posted.body.meet_note === 'Lobby of Morrill Tower' &&
    posted.body.availability?.length === 2,
  'P5-SELL-04: spots, extra place and times are saved on the listing',
  `HTTP ${posted.status}`,
);

// P5-SELL-05: share card
const shareReq = await post(
  '/functions/v1/upload-url',
  {
    kind: 'share',
    target_id: id,
    files: [{ idx: 0, variant: 'full', type: 'image/jpeg', size: jpeg.length }],
  },
  seller.token,
);
const shareUp = (await json(shareReq)).uploads?.[0];
check(
  shareReq.status === 200 && shareUp?.key === `share/${id}.jpg`,
  'upload-url signs the share card at share/{id}.jpg',
  shareUp?.key ?? `HTTP ${shareReq.status}`,
);
const put = shareUp
  ? await fetch(shareUp.url, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body: jpeg,
    })
  : { status: 0 };
const recorded = await rpc('set_listing_share_image', { id }, seller.token);
const row = (await json(await admin(`listings?select=share_image_path&id=eq.${id}`)))[0];
check(
  put.status === 200 && ok2xx(recorded.status) && row?.share_image_path === `share/${id}.jpg`,
  'P5-SELL-05: share_image_path is set',
  `PUT ${put.status}, RPC ${recorded.status}, ${row?.share_image_path}`,
);
const og = await fetch(publicUrl(`share/${id}.jpg`));
const ogBytes = new Uint8Array(await og.arrayBuffer());
check(
  og.status === 200 && ogBytes[0] === 0xff && ogBytes[1] === 0xd8,
  'P5-SELL-05: the share image loads (JPEG)',
  `HTTP ${og.status}, ${ogBytes.length} bytes`,
);
const other = await student(`peek${run}@osu.edu`, 'Pat');
const notMine = await rpc('set_listing_share_image', { id }, other.token);
check(JSON.stringify(notMine.body).includes('NOT_FOUND'), "someone else can't set it");

// P5-SELL-07: orphan draft cleanup
const orphan = (await rpc('reserve_listing_id', {}, seller.token)).body;
const draftUp = await uploadPhoto(seller.token, orphan);
const before = await fetch(publicUrl(draftUp.photo.path));
await admin(`listing_reservations?id=eq.${orphan}`, {
  method: 'PATCH',
  body: JSON.stringify({ created_at: new Date(Date.now() - 30 * 3600 * 1000).toISOString() }),
});
const fresh = (await rpc('reserve_listing_id', {}, seller.token)).body;
const freshUp = await uploadPhoto(seller.token, fresh);
const noKey = await post('/functions/v1/cleanup-drafts', {}, key);
check(
  noKey.status === 401,
  'T-SEC-14: cleanup-drafts refuses without the service key',
  `HTTP ${noKey.status}`,
);
const cleaned = await fetch(`${url}/functions/v1/cleanup-drafts`, {
  method: 'POST',
  headers: { authorization: `Bearer ${service}`, 'content-type': 'application/json' },
  body: '{}',
});
const cleanedBody = await json(cleaned);
const after = await fetch(publicUrl(draftUp.photo.path));
const rowGone =
  (await json(await admin(`listing_reservations?select=id&id=eq.${orphan}`))).length === 0;
check(
  before.status === 200 && cleaned.status === 200 && after.status >= 400 && rowGone,
  'P5-SELL-07: an orphan draft older than 24 h loses its photos and reservation',
  `before ${before.status}, run ${cleaned.status} ${JSON.stringify(cleanedBody)}, after ${after.status}`,
);
const freshStill = await fetch(publicUrl(freshUp.photo.path));
const postedStill = await fetch(publicUrl(up.photo.path));
check(
  freshStill.status === 200 && postedStill.status === 200,
  'a fresh draft and a posted listing keep their photos',
  `fresh ${freshStill.status}, posted ${postedStill.status}`,
);

process.exit(failed ? 1 : 0);
