// P4-AUTH-15 local half: after scripts/seed-review.ts, both reviewer accounts
// sign in with the password and land on an onboarded Demo University profile.
//   ANON_KEY=... SERVICE_KEY=... REVIEW_PASSWORD=... node scripts/verify/review-smoke.mjs
const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const key = process.env.ANON_KEY;
const service = process.env.SERVICE_KEY;
const password = process.env.REVIEW_PASSWORD;
let failed = 0;
const check = (ok, name, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
for (const email of ['appreview@review.onlyswap.test', 'playreview@review.onlyswap.test']) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  const id = body.user?.id;
  const rows = id
    ? await (
        await fetch(
          `${url}/rest/v1/profiles?select=status,first_name,rules_version,campus_id&id=eq.${id}`,
          {
            headers: { apikey: service, authorization: `Bearer ${service}` },
          },
        )
      ).json()
    : [];
  const p = rows[0] ?? {};
  check(
    res.status === 200 &&
      p.status === 'active' &&
      Boolean(p.first_name) &&
      Boolean(p.rules_version) &&
      p.campus_id === '10000000-0000-4000-8000-000000000002',
    `P4-AUTH-15: ${email} signs in with the password, onboarded on Demo University`,
    `HTTP ${res.status}`,
  );
}
const wrong = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: key, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'appreview@review.onlyswap.test', password: `${password}x` }),
});
check(wrong.status >= 400, 'a wrong password is refused', `HTTP ${wrong.status}`);
process.exit(failed ? 1 : 0);
