// Shared helpers for the live smokes against local Supabase (S22 onward).
//   import { env, check, rpc, student, rest, done } from './lib.mjs';
export const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const key = process.env.ANON_KEY;
export const service = process.env.SERVICE_KEY;
const mailpit = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
if (!key || !service) {
  console.error('ANON_KEY and SERVICE_KEY must be set');
  process.exit(2);
}

let failed = 0;
export const check = (ok, name, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
export const done = () => process.exit(failed ? 1 : 0);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = async (res) => {
  try {
    return await res.json();
  } catch {
    return {};
  }
};
export const post = (path, body, token, apikey = key) =>
  fetch(`${url}${path}`, {
    method: 'POST',
    headers: {
      apikey,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
export const rpc = async (fn, body, token) => {
  const res = await post(`/rest/v1/rpc/${fn}`, body, token);
  return { status: res.status, body: await json(res) };
};
/** Service-role table insert (fixtures only; the app never writes tables). */
export const rest = async (table, rows) => {
  const res = await post(`/rest/v1/${table}`, rows, service, service);
  return { status: res.status, body: await json(res) };
};
export const ok2xx = (s) => s >= 200 && s < 300;

export async function codeSignIn(email) {
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

/** A signed-in, onboarded student (age, name, rules). */
export async function student(email, name) {
  const s = await codeSignIn(email);
  const rules = (await rpc('get_app_config', {}, s.token)).body.rules_version;
  await rpc('confirm_age', { method: 'os_signal', is_adult: true }, s.token);
  await rpc('update_profile', { first_name: name }, s.token);
  await rpc('accept_rules', { version: rules }, s.token);
  return s;
}

/** A plain active listing owned by `seller` (service insert, no photos). */
export async function listing(seller, campusId, patch = {}) {
  const id = crypto.randomUUID();
  const r = await rest('listings', {
    id,
    campus_id: campusId,
    seller_id: seller.id,
    title: patch.title ?? 'Smoke test item',
    price_cents: patch.price_cents ?? 2000,
    kind: patch.kind ?? 'sale',
    status: 'active',
    ...patch,
  });
  if (!ok2xx(r.status)) throw new Error(`listing insert failed: ${JSON.stringify(r.body)}`);
  return id;
}

export async function campusOf(s) {
  const res = await fetch(`${url}/rest/v1/profiles?id=eq.${s.id}&select=campus_id`, {
    headers: { apikey: service, authorization: `Bearer ${service}` },
  });
  return (await json(res))[0]?.campus_id;
}
