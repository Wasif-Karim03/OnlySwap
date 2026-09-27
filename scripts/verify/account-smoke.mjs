// Live account-safety checks against local Supabase (S15).
//   ANON_KEY=... SERVICE_KEY=... node scripts/verify/account-smoke.mjs
// Needs `supabase start` and `supabase functions serve`.
//
// P4-AUTH-14  an overdue yearly check blocks writes; a fresh code + complete_reverify lifts it.
// P4-AUTH-18  T-INT-AUTH-05: "Sign out of all devices" kills a second session's refresh token.
//             T-INT-AUTH-06: a suspended user's unexpired JWT cannot write; revoke-sessions
//             kills the refresh token. T-SEC-14: internal functions refuse without the key.
// P4-AUTH-19  support-request stores the request (3/h per IP); admin-change-email moves the
//             account to the new school address (campus re-resolved) and the person
//             confirms it by signing in with a code sent there (T-INT-AUTH-07).
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
    body: JSON.stringify(body ?? {}),
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
const refresh = (refreshToken) =>
  post('/auth/v1/token?grant_type=refresh_token', { refresh_token: refreshToken });

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
  return { token: v.access_token, refresh: v.refresh_token, id: v.user.id };
}
async function onboard(s, name) {
  const rules = (await rpc('get_app_config', {}, s.token)).body.rules_version;
  await rpc('confirm_age', { method: 'os_signal', is_adult: true }, s.token);
  await rpc('update_profile', { first_name: name }, s.token);
  await rpc('accept_rules', { version: rules }, s.token);
}
const ok2xx = (s) => s >= 200 && s < 300;

const run = Date.now();
const other = await codeSignIn(`peer${run}@osu.edu`);

// P4-AUTH-14 ----------------------------------------------------------------------------------
const a = await codeSignIn(`reverify${run}@osu.edu`);
await onboard(a, 'Rey');
const write = () => rpc('block_user', { user_id: other.id }, a.token);
const undo = () => rpc('unblock_user', { user_id: other.id }, a.token);
const yesterday = new Date(Date.now() - 36 * 3600 * 1000).toISOString().slice(0, 10);
await admin(`profiles?id=eq.${a.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ verified_until: yesterday }),
});
const blocked = await write();
check(
  JSON.stringify(blocked.body).includes('NOT_ACTIVE:reverify'),
  'P4-AUTH-14: an overdue yearly check refuses writes',
  `HTTP ${blocked.status}`,
);
const renewed = await rpc('complete_reverify', {}, a.token);
check(
  ok2xx(renewed.status) && /^\d{4}-\d{2}-\d{2}$/.test(renewed.body.verified_until ?? ''),
  'P4-AUTH-14: complete_reverify right after a code sign-in renews it',
  renewed.body.verified_until ?? `HTTP ${renewed.status}`,
);
const afterRenew = await write();
check(ok2xx(afterRenew.status), 'P4-AUTH-14: writes work again', `HTTP ${afterRenew.status}`);
await undo();

// P4-AUTH-18: T-INT-AUTH-05 (two sessions, global sign-out) ------------------------------------
const pw = (email, password) => post('/auth/v1/token?grant_type=password', { email, password });
const s1 = await json(await pw('appreview@review.onlyswap.test', 'local-review-only'));
const s2 = await json(await pw('appreview@review.onlyswap.test', 'local-review-only'));
check(Boolean(s1.access_token && s2.access_token), 'two sessions for the same account');
const globalOut = await post('/auth/v1/logout?scope=global', {}, s1.access_token);
const s2refresh = await refresh(s2.refresh_token);
check(
  ok2xx(globalOut.status) && s2refresh.status >= 400,
  'T-INT-AUTH-05: "Sign out of all devices" kills the other session\'s refresh',
  `logout ${globalOut.status}, second refresh ${s2refresh.status}`,
);

// P4-AUTH-18: T-SEC-14 + T-INT-AUTH-06 ------------------------------------------------------
const b = await codeSignIn(`suspend${run}@osu.edu`);
await onboard(b, 'Sus');
for (const fn of ['revoke-sessions', 'admin-change-email']) {
  const noKey = await post(`/functions/v1/${fn}`, { user_id: b.id, new_email: 'x@osu.edu' });
  const anonKey = await post(`/functions/v1/${fn}`, { user_id: b.id, new_email: 'x@osu.edu' }, key);
  check(
    noKey.status === 401 && anonKey.status === 401,
    `T-SEC-14: ${fn} refuses without the service key`,
    `${noKey.status}/${anonKey.status}`,
  );
}
await admin(`profiles?id=eq.${b.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'suspended' }),
});
const suspendedWrite = await rpc('block_user', { user_id: other.id }, b.token);
check(
  JSON.stringify(suspendedWrite.body).includes('NOT_ACTIVE:suspended'),
  "T-INT-AUTH-06: a suspended user's unexpired JWT cannot write",
  `HTTP ${suspendedWrite.status}`,
);
const revoked = await post('/functions/v1/revoke-sessions', { user_id: b.id }, service);
const revokedBody = await json(revoked);
const bRefresh = await refresh(b.refresh);
check(
  revoked.status === 200 && revokedBody.revoked >= 1 && bRefresh.status >= 400,
  'T-INT-AUTH-06: revoke-sessions kills the refresh token',
  `revoked ${revokedBody.revoked ?? '?'}, refresh ${bRefresh.status}`,
);

// P4-AUTH-19: support-request ------------------------------------------------------------------
const ip = `198.51.100.${(run % 200) + 20}`;
const help = (body, extra = {}) =>
  post('/functions/v1/support-request', body, null, { 'x-forwarded-for': ip, ...extra });
const first = await help({
  email: `lost${run}@gmail.com`,
  topic: 'cant_access_email',
  body: 'My school changed my address.',
});
check(
  first.status === 200,
  'support-request: the app can send without Turnstile',
  `HTTP ${first.status}`,
);
const stored = await json(
  await admin(`support_requests?select=topic,email&email=eq.lost${run}@gmail.com`),
);
check(
  Array.isArray(stored) && stored[0]?.topic === 'cant_access_email',
  'support-request: stored for the owner',
);
const web = await help(
  { email: 'w@gmail.com', topic: 'general', body: 'hi' },
  { origin: 'https://onlyswap.app' },
);
check(
  web.status === 400,
  'support-request: a browser without Turnstile is refused',
  `HTTP ${web.status}`,
);
const more = [];
for (let i = 0; i < 3; i += 1)
  more.push((await help({ email: `m${i}${run}@gmail.com`, topic: 'general', body: 'hi' })).status);
check(
  more[0] === 200 && more[1] === 200 && more[2] === 429,
  'support-request: the fourth in an hour from one IP is 429',
  [200, ...more].join(','),
);

// P4-AUTH-19: admin-change-email (T-INT-AUTH-07) -------------------------------------------------
const c = await codeSignIn(`moving${run}@osu.edu`);
await onboard(c, 'Mo');
const newEmail = `moved${run}@umich.edu`;
const changed = await post(
  '/functions/v1/admin-change-email',
  { user_id: c.id, new_email: newEmail },
  service,
);
check(changed.status === 200, 'admin-change-email with the service key', `HTTP ${changed.status}`);
const row = (await json(await admin(`profiles?select=campus_id,status&id=eq.${c.id}`)))[0] ?? {};
check(
  row.campus_id === '10000000-0000-4000-8000-000000000003' && row.status === 'waitlist',
  'T-INT-AUTH-07: the campus follows the new domain (Michigan, not live yet: waitlist)',
  `${row.campus_id ?? '?'} ${row.status ?? '?'}`,
);
const cRefresh = await refresh(c.refresh);
check(cRefresh.status >= 400, 'old sessions are signed out', `refresh ${cRefresh.status}`);
const again = await codeSignIn(newEmail).catch(() => null);
check(
  again?.id === c.id,
  'T-INT-AUTH-07: a code sent to the new address signs into the same account',
  again ? 'same id' : 'no session',
);

process.exit(failed ? 1 : 0);
