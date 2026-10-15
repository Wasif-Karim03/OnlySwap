// Shared helpers for the OnlySwap k6 scenarios (local Supabase only).
import http from 'k6/http';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';
import { SharedArray } from 'k6/data';
import { Counter, Trend } from 'k6/metrics';

export const API = __ENV.API_URL || 'http://127.0.0.1:54321';
export const WS = API.replace('http', 'ws');
export const ANON = __ENV.ANON_KEY;          // from `supabase status -o env` (never committed)
const SECRET = __ENV.JWT_SECRET;             // local HS256 secret; PostgREST/Realtime accept it
export const NUSERS = 5000;
// 4xx are business answers (RATE_LIMITED, LISTING_UNAVAILABLE...) and counted separately; only 5xx/timeouts are failures.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 499 }));

export const listings = new SharedArray('listings', () => JSON.parse(open('./data/listings.json')));
export const chats = new SharedArray('chats', () => JSON.parse(open('./data/chats.json')));
export const quadPosts = new SharedArray('quad', () => JSON.parse(open('./data/quad.json')));

export const rateLimited = new Counter('rate_limited');       // RATE_LIMITED business errors (app behaviour, not failures)
export const bizErrors = new Counter('business_errors');      // other 4xx RPC errors (e.g. listing no longer available)
export const serverErrors = new Counter('server_errors');     // 5xx / timeouts / 57014 statement_timeout
export const deadlocks = new Counter('deadlocks');           // Postgres 40P01 surfaced to the client
export const stmtTimeouts = new Counter('statement_timeouts');
export const rpcDuration = new Trend('rpc_duration', true);

export function uid(n) { return '50000000-0000-4000-8000-' + String(n).padStart(12, '0'); }

const tokens = {};
export function jwt(n) {
  const now = Math.floor(Date.now() / 1000);
  if (tokens[n] && tokens[n].exp > now + 300) return tokens[n].t;
  const exp = now + 3600;
  const h = encoding.b64encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'rawurl');
  const p = encoding.b64encode(JSON.stringify({
    iss: 'supabase-demo', aud: 'authenticated', role: 'authenticated', sub: uid(n),
    email: `lt${n}@loadtest.edu`, aal: 'aal1', iat: now, exp,
  }), 'rawurl');
  const sig = encoding.b64encode(crypto.hmac('sha256', SECRET, `${h}.${p}`, 'binary'), 'rawurl');
  const t = `${h}.${p}.${sig}`;
  tokens[n] = { t, exp };
  return t;
}

export function headers(n) {
  return { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${jwt(n)}` };
}

/** Calls /rest/v1/rpc/<fn> as seeded user n. Returns {res, body}. Classifies failures. */
export function rpc(n, fn, args, tag) {
  const res = http.post(`${API}/rest/v1/rpc/${fn}`, JSON.stringify(args || {}), {
    headers: headers(n), tags: { rpc: tag || fn }, timeout: '30s',
  });
  rpcDuration.add(res.timings.duration, { rpc: tag || fn });
  let body = null;
  if (res.status >= 500 || res.status === 0) serverErrors.add(1);
  else if (res.status >= 400) {
    const txt = res.body || '';
    if (txt.indexOf('RATE_LIMITED') >= 0) rateLimited.add(1);
    else if (txt.indexOf('deadlock') >= 0) { deadlocks.add(1); serverErrors.add(1); }
    else if (txt.indexOf('statement timeout') >= 0 || txt.indexOf('57014') >= 0) { stmtTimeouts.add(1); serverErrors.add(1); }
    else bizErrors.add(1);
  }
  return { res, ok: res.status >= 200 && res.status < 300 };
}

export function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}
export const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Stage helper: ramp to 500 VUs, hold, spike to 1000, hold, ramp down. */
export function stages500to1000(scale) {
  const s = scale || 1;
  if (__ENV.SMOKE) return [{ duration: '20s', target: Number(__ENV.SMOKE) }];
  const f = Number(__ENV.PEAK || 500) / 500;   // PEAK=250 -> 250 VU peak, 500 VU spike (local Kong caps at ~512 connections)
  const t = (n) => Math.max(1, Math.round(n * f));
  return [
    { duration: `${30 * s}s`, target: t(100) },
    { duration: `${30 * s}s`, target: t(500) },
    { duration: `${60 * s}s`, target: t(500) },   // sustained peak
    { duration: `${15 * s}s`, target: t(1000) },  // 2x spike
    { duration: `${45 * s}s`, target: t(1000) },
    { duration: `${20 * s}s`, target: 0 },
  ];
}

export const thresholds = {
  http_req_duration: ['p(95)<500'],
  http_req_failed: ['rate<0.01'],
  server_errors: ['count<50'],
};
