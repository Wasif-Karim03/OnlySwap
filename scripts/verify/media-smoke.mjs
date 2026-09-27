// Live media pipeline against local Supabase (S13: P5-MEDIA-02, P5-MEDIA-04).
//   SUPABASE_URL=... ANON_KEY=... SERVICE_KEY=... node --experimental-strip-types scripts/verify/media-smoke.mjs
// Needs `supabase start` and `supabase functions serve` with the R2_* env from
// scripts/verify/s13.sh (local Storage S3 stands in for R2).
//
// 1. Student A uploads an avatar through upload-url (presigned PUT) and it is
//    publicly readable, byte for byte, with no location data.
// 2. upload-url refuses someone else's listing (403) and wrong sizes (400).
// 3. A sets the avatar on their profile; student B reports A (evidence keeps
//    the avatar key). A deletes the account: the avatar leaves the public
//    bucket and a copy sits in onlyswap-private/evidence/{report}/ (T-INT-DEL-03).
// 4. INFO: a body larger than the signed content-length (T-SEC-18). Local
//    Storage may accept it; R2 must refuse it (checked again on staging).
import { readFileSync } from 'node:fs';

import { inspectExif } from '../../apps/mobile/src/lib/exifGps.ts';

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
const info = (name, detail) => console.log(`INFO  ${name}  (${detail})`);
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
    body: JSON.stringify(body),
  });
const rpc = async (fn, body, token) => {
  const res = await post(`/rest/v1/rpc/${fn}`, body, token);
  return { status: res.status, body: await json(res) };
};

async function student(prefix) {
  const email = `${prefix}${Date.now()}@osu.edu`;
  await post('/auth/v1/otp', { email, create_user: true });
  let code;
  for (let i = 0; i < 20 && !code; i += 1) {
    await sleep(500);
    const res = await fetch(
      `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    if (res.ok) code = (await res.json()).messages?.[0]?.Subject?.match(/\b(\d{6})\b/)?.[1];
  }
  const v = code
    ? await json(await post('/auth/v1/verify', { type: 'email', email, token: code }))
    : {};
  if (!v.access_token) throw new Error(`sign-in failed for ${email}`);
  // Finish onboarding so the account is active (age, name, rules).
  const token = v.access_token;
  const rules = (await rpc('get_app_config', {}, token)).body.rules_version;
  await rpc('confirm_age', { method: 'os_signal', is_adult: true }, token);
  await rpc('update_profile', { first_name: prefix === 'a' ? 'Ana' : 'Bo' }, token);
  await rpc('accept_rules', { version: rules }, token);
  return { token, id: v.user.id, email };
}

const webp = new Uint8Array(
  readFileSync(new URL('../../apps/mobile/src/lib/__fixtures__/clean.webp', import.meta.url)),
);

const a = await student('a');
const b = await student('b');
check(Boolean(a.token && b.token), 'two onboarded students');

// 1. Avatar upload
const req = await post(
  '/functions/v1/upload-url',
  {
    kind: 'avatar',
    target_id: a.id,
    files: [{ idx: 0, variant: 'full', type: 'image/webp', size: webp.length }],
  },
  a.token,
);
const reqBody = await json(req);
const up = reqBody.uploads?.[0];
check(
  req.status === 200 && Boolean(up?.url),
  'upload-url signs an avatar upload',
  `HTTP ${req.status}`,
);
check(
  typeof up?.key === 'string' && up.key.startsWith('c/') && up.key.includes(`/u/${a.id}/avatar_`),
  'the server picked the key under the student folder',
  up?.key,
);
if (!up) process.exit(1);

const put = await fetch(up.url, {
  method: 'PUT',
  headers: { 'content-type': 'image/webp' },
  body: webp,
});
check(
  put.status === 200,
  'presigned PUT works',
  `HTTP ${put.status} ${put.ok ? '' : (await put.text()).slice(0, 160)}`,
);

const publicUrl = `${url}/storage/v1/object/public/onlyswap-media/${up.key}`;
const got = await fetch(publicUrl);
const bytes = new Uint8Array(await got.arrayBuffer());
check(
  got.status === 200 && bytes.length === webp.length,
  'the photo is publicly readable, same bytes',
  `HTTP ${got.status}`,
);
check(!inspectExif(bytes).hasGps, 'no location data in the stored photo');

// 2. Refusals
const other = await post(
  '/functions/v1/upload-url',
  {
    kind: 'listing',
    target_id: crypto.randomUUID(),
    files: [{ idx: 0, variant: 'full', type: 'image/webp', size: 100 }],
  },
  a.token,
);
check(other.status === 403, 'wrong owner is refused', `HTTP ${other.status}`);
const big = await post(
  '/functions/v1/upload-url',
  {
    kind: 'avatar',
    target_id: a.id,
    files: [{ idx: 0, variant: 'full', type: 'image/webp', size: 400 * 1024 }],
  },
  a.token,
);
check(big.status === 400, 'oversize request is refused before signing', `HTTP ${big.status}`);

// 4. Signed length vs a bigger body (T-SEC-18)
const req2 = await json(
  await post(
    '/functions/v1/upload-url',
    {
      kind: 'avatar',
      target_id: a.id,
      files: [{ idx: 0, variant: 'full', type: 'image/webp', size: 10 }],
    },
    a.token,
  ),
);
if (req2.uploads?.[0]) {
  const cheat = await fetch(req2.uploads[0].url, {
    method: 'PUT',
    headers: { 'content-type': 'image/webp' },
    body: webp,
  });
  info(
    'T-SEC-18 body larger than the signed length',
    `local Storage answered HTTP ${cheat.status}; R2 must answer 403 (staging check)`,
  );
}

// 3. Evidence survives the account (T-INT-DEL-03)
const prof = await rpc('update_profile', { first_name: 'Ana', avatar_path: up.key }, a.token);
check(prof.status === 200, 'avatar set on the profile', `HTTP ${prof.status}`);
const rep = await rpc(
  'create_report',
  { target_type: 'user', target_id: a.id, reason: 'scam' },
  b.token,
);
check(rep.status === 200 && Boolean(rep.body.id), 'B reports A', `HTTP ${rep.status}`);

const del = await post('/functions/v1/delete-account', { confirm: 'DELETE' }, a.token);
check(
  del.status === 200,
  'A deletes the account',
  `HTTP ${del.status} ${del.ok ? '' : JSON.stringify(await json(del))}`,
);

const gone = await fetch(publicUrl);
check(
  gone.status === 400 || gone.status === 404,
  'the avatar is gone from the public bucket',
  `HTTP ${gone.status}`,
);

const file = up.key.slice(up.key.lastIndexOf('/') + 1);
const kept = await fetch(
  `${url}/storage/v1/object/authenticated/onlyswap-private/evidence/${rep.body.id}/${file}`,
  { headers: { apikey: service, authorization: `Bearer ${service}` } },
);
check(
  kept.status === 200,
  'a copy is kept in onlyswap-private/evidence/{report}/',
  `HTTP ${kept.status}`,
);

process.exit(failed ? 1 : 0);
