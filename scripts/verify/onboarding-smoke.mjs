// Live onboarding checks against local Supabase (S14).
//   ANON_KEY=... SERVICE_KEY=... node --experimental-strip-types scripts/verify/onboarding-smoke.mjs
// Needs `supabase start` and `supabase functions serve` with the env written
// by scripts/verify/s14.sh (local Storage stands in for R2; Turnstile uses
// Cloudflare's published always-pass test secret).
//
// 1. P4-AUTH-11 / T-FN-06: waitlist-request answers { ok: true } for new and
//    duplicate addresses, stores one row, needs Turnstile from a browser, and
//    limits one IP to 5 an hour.
// 2. P4-AUTH-08 (API half of E2E-01): a new student uploads an avatar and
//    update_profile writes first name, last initial, year and avatar_path.
// 3. P4-AUTH-17 (API half of E2E-22): the owner bumps rules_version; writes
//    are refused with RULES_REQUIRED until the new version is accepted.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = async (res) => {
  try {
    return await res.json();
  } catch {
    return {};
  }
};
const post = (path, body, token, extra = {}) =>
  fetch(`${url}${path}`, {
    method: 'POST',
    headers: {
      apikey: key,
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extra,
    },
    body: JSON.stringify(body),
  });
const rpc = async (fn, body, token) => {
  const res = await post(`/rest/v1/rpc/${fn}`, body, token);
  return { status: res.status, body: await json(res) };
};
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

async function signIn(email) {
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
  return { token: v.access_token, id: v.user.id };
}

// 1. waitlist-request ---------------------------------------------------------------------------
const run = Date.now();
const waitlist = (body, headers = {}) =>
  post('/functions/v1/waitlist-request', body, null, headers);
const email = `wait${run}@notyet.edu`;
const first = await waitlist({ email });
const firstBody = await json(first);
check(
  first.status === 200 && firstBody.ok === true,
  'waitlist: the app gets { ok: true }',
  `HTTP ${first.status}`,
);
const dup = await waitlist({ email: email.toUpperCase() });
const dupBody = await json(dup);
check(
  dup.status === 200 && JSON.stringify(dupBody) === JSON.stringify(firstBody),
  'waitlist: a duplicate gets the same answer',
  `HTTP ${dup.status}`,
);
const rows = await json(
  await admin(`waitlist_requests?select=domain,email_enc&domain=eq.notyet.edu`),
);
check(
  Array.isArray(rows) && rows.length === 1 && !String(rows[0].email_enc).includes('wait'),
  'waitlist: one row, the address stored only encrypted',
  `${Array.isArray(rows) ? rows.length : '?'} row(s)`,
);
const noToken = await waitlist(
  { email: `web${run}@notyet.edu` },
  { origin: 'https://onlyswap.app' },
);
check(
  noToken.status === 400,
  'waitlist: a browser without Turnstile is refused',
  `HTTP ${noToken.status}`,
);
const withToken = await waitlist(
  { email: `web${run}@notyet.edu`, turnstile_token: 'XXXX.DUMMY.TOKEN.XXXX' },
  { origin: 'https://onlyswap.app' },
);
check(
  withToken.status === 200,
  'waitlist: a browser with a Turnstile token is accepted (Cloudflare test secret)',
  `HTTP ${withToken.status}`,
);
const ip = `198.51.100.${run % 250}`;
const statuses = [];
for (let i = 0; i < 6; i += 1) {
  statuses.push(
    (await waitlist({ email: `ip${run}-${i}@notyet.edu` }, { 'x-forwarded-for': ip })).status,
  );
}
check(
  statuses.slice(0, 5).every((s) => s === 200) && statuses[5] === 429,
  'waitlist: the sixth request from one IP in an hour is 429',
  statuses.join(','),
);

// 2. profile setup with an avatar ---------------------------------------------------------------
const s = await signIn(`setup${run}@osu.edu`);
await rpc('confirm_age', { method: 'os_signal', is_adult: true }, s.token);
const webp = new Uint8Array(
  readFileSync(new URL('../../apps/mobile/src/lib/__fixtures__/clean.webp', import.meta.url)),
);
const signed = await post(
  '/functions/v1/upload-url',
  {
    kind: 'avatar',
    target_id: s.id,
    files: [{ idx: 0, variant: 'full', type: 'image/webp', size: webp.byteLength }],
  },
  s.token,
);
const upload = (await json(signed)).uploads?.[0];
const put = upload
  ? await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: webp })
  : { status: 0 };
check(put.status === 200, 'avatar uploaded through upload-url', `HTTP ${put.status}`);
const saved = await rpc(
  'update_profile',
  { first_name: 'Wasif', last_initial: 'K', year: 'sophomore', avatar_path: upload?.key ?? null },
  s.token,
);
check(saved.status === 200, 'update_profile succeeds', `HTTP ${saved.status}`);
const row =
  (
    await json(
      await admin(
        `profiles?select=first_name,last_initial,year,avatar_path,display_name&id=eq.${s.id}`,
      ),
    )
  )[0] ?? {};
check(
  row.first_name === 'Wasif' &&
    row.last_initial === 'K' &&
    row.year === 'sophomore' &&
    row.avatar_path === upload?.key,
  'P4-AUTH-08: the profile row is updated',
  `${row.display_name ?? '?'}, ${row.year ?? '?'}`,
);

// 3. rules re-accept ----------------------------------------------------------------------------
const cfg = (await rpc('get_app_config', {}, s.token)).body;
const accepted = await rpc('accept_rules', { version: cfg.rules_version }, s.token);
check(
  accepted.status === 200 || accepted.status === 204,
  'rules accepted at the current version',
  `v${cfg.rules_version}`,
);
const other = await signIn(`other${run}@osu.edu`);
const canWrite = async () => rpc('block_user', { user_id: other.id }, s.token);
const before = await canWrite();
check(
  before.status === 200 || before.status === 204,
  'a write works before the bump',
  `HTTP ${before.status}`,
);
await rpc('unblock_user', { user_id: other.id }, s.token);

const next = String(Number.parseInt(cfg.rules_version, 10) + 1);
await admin('app_config?key=eq.rules_version', {
  method: 'PATCH',
  body: JSON.stringify({ value: next }),
});
await admin('app_config?key=eq.rules_changes', {
  method: 'PATCH',
  body: JSON.stringify({ value: ['Fakes are now on the banned list.'] }),
});
const cfg2 = (await rpc('get_app_config', {}, s.token)).body;
check(
  cfg2.rules_version === next && cfg2.rules_changes?.[0] === 'Fakes are now on the banned list.',
  'E2E-22: the owner bumps the version; the app sees it with what changed',
  `v${cfg2.rules_version}`,
);
const blocked = await canWrite();
check(
  blocked.status >= 400 && JSON.stringify(blocked.body).includes('RULES_REQUIRED'),
  'E2E-22: writes are refused with RULES_REQUIRED until accepted',
  `HTTP ${blocked.status}`,
);
const again = await rpc('accept_rules', { version: next }, s.token);
const after = await canWrite();
check(
  (again.status === 200 || again.status === 204) && (after.status === 200 || after.status === 204),
  'E2E-22: after accepting the new version, writes work again',
  `HTTP ${after.status}`,
);
// Put the version back so the seeded accounts still open straight to the feed.
await admin('app_config?key=eq.rules_version', {
  method: 'PATCH',
  body: JSON.stringify({ value: cfg.rules_version }),
});
await admin('app_config?key=eq.rules_changes', {
  method: 'PATCH',
  body: JSON.stringify({ value: [] }),
});

// The stored avatar has no EXIF at all (P5-MEDIA-03 on the server side).
if (upload) {
  const got = await fetch(`${url}/storage/v1/object/public/onlyswap-media/${upload.key}`);
  const report = inspectExif(new Uint8Array(await got.arrayBuffer()));
  check(
    got.status === 200 && !report.hasGps,
    'the stored avatar has no location data',
    `HTTP ${got.status}`,
  );
}

process.exit(failed ? 1 : 0);
