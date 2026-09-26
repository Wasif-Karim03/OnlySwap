// Local Auth smoke test (S10: P3-AUTH-01/02/03, P3-SEED-01) against `supabase start`.
//   SUPABASE_URL=... ANON_KEY=... node scripts/verify/auth-smoke.mjs
// 1. An unknown domain is refused by the before_user_created hook.
// 2. A new osu.edu address gets a 6-digit code (read from Mailpit), with the
//    code in the subject; verifying it returns a session whose JWT carries the
//    custom claims, and the signup trigger made the profile.
// 3. The seeded reviewer signs in with a password.
const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const key = process.env.ANON_KEY;
const mailpit = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
if (!key) {
  console.error('ANON_KEY is not set');
  process.exit(2);
}

const headers = { apikey: key, 'content-type': 'application/json' };
let failed = 0;
const check = (ok, name, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
const post = async (path, body) => {
  const res = await fetch(`${url}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Unknown domain
const bad = await post('/auth/v1/otp', { email: 'someone@gmail.com', create_user: true });
check(
  bad.status >= 400 && JSON.stringify(bad.json).includes('SCHOOL_UNKNOWN'),
  'unknown domain refused with SCHOOL_UNKNOWN',
  `HTTP ${bad.status}`,
);

// 2. New student: code by email, verify, claims
const email = `smoke${Date.now()}@osu.edu`;
const sent = await post('/auth/v1/otp', { email, create_user: true });
check(sent.status === 200, 'code requested for a new osu.edu address', `HTTP ${sent.status}`);

let subject = '';
for (let i = 0; i < 20 && !subject; i += 1) {
  await sleep(500);
  const res = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  if (res.ok) {
    const data = await res.json();
    subject = data.messages?.[0]?.Subject ?? '';
  }
}
const code = subject.match(/\b(\d{6})\b/)?.[1];
check(Boolean(code), 'email arrived with the 6-digit code in the subject', subject || 'no email');

if (code) {
  const verified = await post('/auth/v1/verify', { type: 'email', email, token: code });
  const token = verified.json.access_token;
  check(Boolean(token), 'code verifies into a session', `HTTP ${verified.status}`);
  if (token) {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    check(
      typeof claims.campus_id === 'string' && claims.status === 'active' && claims.adult === false,
      'JWT has campus_id, status and adult claims',
      `status=${claims.status} adult=${claims.adult}`,
    );
    const prof = await fetch(`${url}/rest/v1/profiles?select=id,status`, {
      headers: { apikey: key, authorization: `Bearer ${token}` },
    });
    const rows = prof.ok ? await prof.json() : [];
    check(
      rows.length === 1 && rows[0].status === 'active',
      'signup trigger made the profile',
      `HTTP ${prof.status}`,
    );
  }
}

// 3. Reviewer password sign-in (local seed only)
const rev = await post('/auth/v1/token?grant_type=password', {
  email: 'appreview@review.onlyswap.test',
  password: 'local-review-only',
});
check(
  Boolean(rev.json.access_token),
  'seeded reviewer signs in with a password',
  `HTTP ${rev.status}`,
);

process.exit(failed ? 1 : 0);
