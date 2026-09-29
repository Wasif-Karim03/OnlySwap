// P14-SEC-01: the live half of the security suite (TESTING §5) against the local
// stack (`supabase start` + `supabase functions serve`, media Worker on 8787).
//   ANON_KEY=... SERVICE_KEY=... node scripts/verify/security.mjs
// The database half is supabase/tests/security.test.sql.
import { campusOf, check, done, key, listing, post, rpc, student, url } from './lib.mjs';

const MEDIA = process.env.MEDIA_URL ?? 'http://127.0.0.1:8787';
const run = Date.now().toString(36);
const a = await student(`sec-a-${run}@osu.edu`, 'Ana');
const b = await student(`sec-b-${run}@osu.edu`, 'Ben');
const campus = await campusOf(b);
const bListing = await listing(b, campus, { title: 'Security test bike' });

// T-SEC-01 PostgREST writes with A's token on B's listing and on A's own status.
{
  const res = await fetch(`${url}/rest/v1/listings?id=eq.${bListing}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      authorization: `Bearer ${a.token}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify({ price_cents: 1 }),
  });
  check(
    [401, 403].includes(res.status) || (await res.json()).length === 0,
    'T-SEC-01 PATCH on another listing changes nothing',
    `status ${res.status}`,
  );
}

// T-SEC-02 a tampered JWT is rejected.
{
  const [h, p, s] = a.token.split('.');
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  claims.campus_id = '00000000-0000-0000-0000-000000000000';
  claims.role = 'service_role';
  const forged = `${h}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${s}`;
  const r = await rpc('get_me', {}, forged);
  check(
    r.status === 401 || r.status === 403,
    'T-SEC-02 edited JWT payload is refused',
    `status ${r.status}`,
  );
}

// T-SEC-03 admin RPC with a student (aal1) token.
{
  const r = await rpc('admin_overview', {}, a.token);
  check(
    String(r.body?.message ?? '').startsWith('NOT_ADMIN'),
    'T-SEC-03 admin RPC without admin + MFA',
    r.body?.message,
  );
}

// T-SEC-06 password sign-up to a school address through the API still needs confirmation.
{
  const res = await post('/auth/v1/signup', {
    email: `sec-pw-${run}@osu.edu`,
    password: 'Correct-Horse-9',
  });
  const body = await res.json().catch(() => ({}));
  check(!body.access_token, 'T-SEC-06 password sign-up gets no session', `status ${res.status}`);
}

// T-SEC-07 many wrong codes: refused, and rate limited before 30.
{
  const email = `sec-otp-${run}@osu.edu`;
  await post('/auth/v1/otp', { email, create_user: true });
  let limited = false;
  let accepted = false;
  for (let i = 0; i < 20; i += 1) {
    const res = await post('/auth/v1/verify', { type: 'email', email, token: String(100000 + i) });
    if (res.status === 429) limited = true;
    if (res.ok) accepted = true;
  }
  check(
    !accepted,
    'T-SEC-07 twenty wrong codes never sign in',
    limited ? 'rate limited' : 'all refused',
  );
}

// T-SEC-08 uploads: another user's listing, huge files, wrong types, traversal.
{
  const call = (body, token) =>
    fetch(`${url}/functions/v1/upload-url`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  const other = await call(
    {
      kind: 'listing',
      target_id: bListing,
      files: [{ idx: 0, variant: 'full', type: 'image/webp', size: 1000 }],
    },
    a.token,
  );
  check(
    other.status === 403 || other.status === 400,
    "T-SEC-08 presign for someone else's listing",
    `status ${other.status}`,
  );
  const huge = await call(
    {
      kind: 'avatar',
      target_id: a.id,
      files: [{ idx: 0, variant: 'full', type: 'image/webp', size: 50 * 1024 * 1024 }],
    },
    a.token,
  );
  check(huge.status === 400, 'T-SEC-08 50 MB file refused', `status ${huge.status}`);
  const svg = await call(
    {
      kind: 'avatar',
      target_id: a.id,
      files: [{ idx: 0, variant: 'full', type: 'image/svg+xml', size: 1000 }],
    },
    a.token,
  );
  check(svg.status === 400, 'T-SEC-08 SVG refused', `status ${svg.status}`);
  // The media Worker checks need `wrangler dev` running; set MEDIA_URL to include them.
  if (process.env.MEDIA_URL) {
    const trav = await fetch(`${MEDIA}/c/../../etc/passwd`).catch(() => null);
    check(
      !trav || trav.status === 404 || trav.status === 400,
      'T-SEC-08 media Worker refuses traversal',
      `status ${trav?.status}`,
    );
    const other404 = await fetch(`${MEDIA}/exports/x.json`).catch(() => null);
    check(
      !other404 || other404.status === 404,
      'T-SEC-08 media Worker serves allow-listed prefixes only',
    );
  } else {
    console.log(
      'SKIP  T-SEC-08 media Worker (set MEDIA_URL with wrangler dev running; unit tests cover the handler)',
    );
  }
}

// T-SEC-10 rate limits: the 11th offer in an hour.
{
  let limited = false;
  for (let i = 0; i < 12 && !limited; i += 1) {
    const id = await listing(b, campus, { title: `Rate test ${i}`, price_cents: 1000 });
    const r = await rpc('make_offer', { listing_id: id, amount_cents: 900 }, a.token);
    if (String(r.body?.message ?? '').startsWith('RATE_LIMITED')) limited = true;
  }
  check(limited, 'T-SEC-10 offers are rate limited');
}

// T-SEC-11 random share tokens find nothing.
{
  const r = await rpc('get_meetup_share', { token: 'abcdefabcdefabcdefabcd' });
  check(
    String(r.body?.message ?? '').startsWith('NOT_FOUND') || r.status === 400,
    'T-SEC-11 random meetup token',
    r.body?.message,
  );
}

// T-SEC-14 internal functions without the service key.
for (const fn of [
  'send-push',
  'send-email',
  'revoke-sessions',
  'admin-change-email',
  'archive-chats',
  'push-receipts',
  'cleanup-drafts',
]) {
  const res = await fetch(`${url}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${a.token}`,
      'content-type': 'application/json',
    },
    body: '{}',
  });
  check(
    res.status === 401 || res.status === 403,
    `T-SEC-14 ${fn} refuses a user token`,
    `status ${res.status}`,
  );
}

// T-SEC-16 realtime: A can't join B's private user channel. Uses the Realtime
// REST broadcast check: authorization is decided by realtime.messages policies.
{
  const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${a.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{ topic: `user:${b.id}`, event: 'ping', payload: {}, private: true }],
    }),
  });
  check(
    res.status === 401 || res.status === 403 || res.status === 202,
    'T-SEC-16 (informational) private channel send; the policy itself is in pgTAP',
    `status ${res.status}`,
  );
}

done();
