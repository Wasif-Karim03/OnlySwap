// Local delete-account smoke test (S11: P4-DEL-01, T-INT-DEL-01 live half).
//   SUPABASE_URL=... ANON_KEY=... node scripts/verify/delete-smoke.mjs
// Needs `supabase start` and `supabase functions serve` running.
// 1. A new osu.edu student signs in with a code (read from Mailpit).
// 2. delete-account without the typed confirmation is refused (400).
// 3. With { confirm: 'DELETE' } it succeeds, and the same session can no
//    longer read its profile (the auth user and profile are gone).
const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const key = process.env.ANON_KEY;
const mailpit = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
if (!key) {
  console.error('ANON_KEY is not set');
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
    body: JSON.stringify(body),
  });

const email = `del${Date.now()}@osu.edu`;
await post('/auth/v1/otp', { email, create_user: true });
let code;
for (let i = 0; i < 20 && !code; i += 1) {
  await sleep(500);
  const res = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  if (res.ok) code = (await res.json()).messages?.[0]?.Subject?.match(/\b(\d{6})\b/)?.[1];
}
const verified = code
  ? await json(await post('/auth/v1/verify', { type: 'email', email, token: code }))
  : {};
const token = verified.access_token;
check(Boolean(token), 'new student signed in with an emailed code');
if (!token) process.exit(1);

const refused = await post('/functions/v1/delete-account', {}, token);
const refusedBody = await json(refused);
check(
  refused.status === 400 && refusedBody.error === 'INVALID:confirm',
  'delete-account refuses without the typed confirmation',
  `HTTP ${refused.status}`,
);

const done = await post('/functions/v1/delete-account', { confirm: 'DELETE' }, token);
const doneBody = await json(done);
check(
  done.status === 200 && doneBody.ok === true,
  'delete-account succeeds',
  `HTTP ${done.status}`,
);

const after = await fetch(`${url}/rest/v1/profiles?select=id`, {
  headers: { apikey: key, authorization: `Bearer ${token}` },
});
const rows = after.ok ? await after.json() : [];
check(Array.isArray(rows) && rows.length === 0, 'the profile is gone', `HTTP ${after.status}`);

const again = await post('/functions/v1/delete-account', { confirm: 'DELETE' }, token);
check(again.status === 401, 'the old session can no longer act', `HTTP ${again.status}`);

process.exit(failed ? 1 : 0);
