// Live underage path (S12: P4-AUTH-07, T-INT-AUTH-04 live half, E2E-02 API half).
//   SUPABASE_URL=... ANON_KEY=... node scripts/verify/underage-smoke.mjs
// Needs `supabase start` and `supabase functions serve`.
// 1. A new osu.edu student signs in with a code (Mailpit).
// 2. confirm_age with a birthday under 18 answers { adult: false }.
// 3. delete-account in underage mode removes the account.
// 4. Signing up again with the same email is refused with AGE_BLOCKED.
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
  if (!code) return null;
  return (await json(await post('/auth/v1/verify', { type: 'email', email, token: code })))
    .access_token;
}

const email = `kid${Date.now()}@osu.edu`;
const token = await signIn(email);
check(Boolean(token), 'new student signed in with an emailed code');
if (!token) process.exit(1);

// Today minus 17 years: under 18 in any time zone.
const d = new Date();
const birth = `${d.getFullYear() - 17}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const age = await post(
  '/rest/v1/rpc/confirm_age',
  { method: 'self_declared', birth_date: birth },
  token,
);
const ageBody = await json(age);
check(
  age.status === 200 && ageBody.adult === false,
  'confirm_age says not adult',
  `HTTP ${age.status}`,
);

const del = await post('/functions/v1/delete-account', { mode: 'underage' }, token);
check(del.status === 200, 'delete-account (underage) removes the account', `HTTP ${del.status}`);

const again = await post('/auth/v1/otp', { email, create_user: true });
const againBody = await json(again);
check(
  again.status >= 400 && JSON.stringify(againBody).includes('AGE_BLOCKED'),
  'signing up again with the same email is refused (AGE_BLOCKED)',
  `HTTP ${again.status}`,
);

process.exit(failed ? 1 : 0);
