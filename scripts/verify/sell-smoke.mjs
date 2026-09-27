// Live Sell checks against local Supabase (S16, P5-SELL-01).
//   ANON_KEY=... SERVICE_KEY=... node scripts/verify/sell-smoke.mjs
// Needs `supabase start` and `supabase functions serve` (upload-url).
//
// A seller reserves an id, uploads a photo under it with upload-url, and
// creates the listing; the same call again returns the same listing
// (T-INT-LIST-04). An unreserved id is FORBIDDEN, a banned word is refused,
// check_text names the term, a give-away expires on its pickup day, and a
// soft-deleted listing disappears for others.
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

const run = Date.now();
const seller = await student(`seller${run}@osu.edu`, 'Sam');
const buyer = await student(`buyer${run}@osu.edu`, 'Bea');

// reserve + upload under the reserved id
const reserved = await rpc('reserve_listing_id', {}, seller.token);
const listingId = reserved.body;
check(
  ok2xx(reserved.status) && typeof listingId === 'string',
  'reserve_listing_id gives an id',
  `HTTP ${reserved.status}`,
);
const up = await uploadPhoto(seller.token, listingId);
check(
  up.status === 200 && Boolean(up.photo),
  'upload-url signs photos for the reserved id (before the listing exists)',
  `HTTP ${up.status}`,
);

const args = {
  id: listingId,
  title: 'Desk lamp',
  category_id: 1,
  condition: 'good',
  price_cents: 1200,
  photos: [up.photo],
};
const first = await rpc('create_listing', args, seller.token);
check(
  ok2xx(first.status) && first.body.status === 'active',
  'create_listing posts the listing',
  `HTTP ${first.status} ${first.body.status ?? JSON.stringify(first.body).slice(0, 120)}`,
);
const again = await rpc('create_listing', args, seller.token);
check(
  ok2xx(again.status) &&
    again.body.id === listingId &&
    again.body.created_at === first.body.created_at,
  'T-INT-LIST-04: the same call again returns the same listing',
);
const seen = await fetch(`${url}/rest/v1/listings?select=id&id=eq.${listingId}`, {
  headers: { apikey: key, authorization: `Bearer ${buyer.token}` },
});
check((await json(seen)).length === 1, 'another student on the campus sees it');

const unreserved = await rpc('create_listing', { ...args, id: crypto.randomUUID() }, seller.token);
check(
  JSON.stringify(unreserved.body).includes('FORBIDDEN'),
  'T-INT-LIST-04: an unreserved id is FORBIDDEN',
  `HTTP ${unreserved.status}`,
);

// banned words
const r2 = (await rpc('reserve_listing_id', {}, seller.token)).body;
const up2 = await uploadPhoto(seller.token, r2);
const banned = await rpc(
  'create_listing',
  { ...args, id: r2, title: 'Vape + charger bundle', photos: [up2.photo] },
  seller.token,
);
check(
  JSON.stringify(banned.body).includes('BANNED_TERM:vape'),
  'a banned word is refused',
  `HTTP ${banned.status}`,
);
const verdict = await rpc('check_text', { text: 'juul pods', scope: 'listing' }, seller.token);
check(
  verdict.body.result === 'block' && verdict.body.term === 'juul',
  'check_text names the term for the inline hint',
  JSON.stringify(verdict.body),
);
const photoFromOther = await rpc(
  'create_listing',
  { ...args, id: r2, photos: [up.photo] },
  seller.token,
);
check(
  JSON.stringify(photoFromOther.body).includes('INVALID:photos'),
  "T-INT-LIST-01: photos must sit under the listing's own path",
);

// give-away with a pickup day (DEC 54)
const tomorrow = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
const free = await rpc(
  'create_listing',
  {
    ...args,
    id: r2,
    kind: 'free',
    title: 'Floor mirror',
    price_cents: 4000,
    category_id: null,
    photos: [up2.photo],
    pickup_by: tomorrow,
  },
  seller.token,
);
check(
  ok2xx(free.status) && free.body.price_cents === 0 && typeof free.body.expires_at === 'string',
  'a give-away is $0 and expires after its pickup day',
  `${free.body.price_cents} ${free.body.expires_at ?? JSON.stringify(free.body).slice(0, 120)}`,
);

// categories for the picker
const cats = await fetch(`${url}/rest/v1/categories?select=id,name,parent_id&order=sort`, {
  headers: { apikey: key, authorization: `Bearer ${seller.token}` },
});
const catRows = await json(cats);
check(
  Array.isArray(catRows) && catRows.some((c) => c.name === 'Monitors' && c.parent_id === 3),
  'the category list loads for the picker',
  `${catRows.length ?? 0} rows`,
);

// soft delete
const del = await rpc('delete_listing', { id: listingId }, seller.token);
const gone = await fetch(`${url}/rest/v1/listings?select=id&id=eq.${listingId}`, {
  headers: { apikey: key, authorization: `Bearer ${buyer.token}` },
});
const kept = await fetch(`${url}/rest/v1/listings?select=status,deleted_at&id=eq.${listingId}`, {
  headers: { apikey: service, authorization: `Bearer ${service}` },
});
const keptRow = (await json(kept))[0];
check(
  ok2xx(del.status) &&
    (await json(gone)).length === 0 &&
    keptRow?.status === 'deleted' &&
    Boolean(keptRow?.deleted_at),
  'delete is soft: the row stays, others no longer see it',
  `HTTP ${del.status} ${keptRow?.status}`,
);

process.exit(failed ? 1 : 0);
