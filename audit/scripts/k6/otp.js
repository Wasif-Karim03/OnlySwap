// OTP sign-in burst against local GoTrue. Local limits come from supabase/config.toml [auth.rate_limit]
// (sign_in_sign_ups 30/5min/IP, email_sent 200/h, token_verifications 30/5min/IP); every k6 VU shares one IP, so most
// requests are expected to be 429. Hosted free tier uses different (higher, but still per-IP) defaults.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { API, ANON, rnd } from './lib.js';
const ok = new Counter('otp_sent'), limited = new Counter('otp_429'), other = new Counter('otp_other');
export const options = { scenarios: { otp: { executor: 'ramping-vus', stages: [{ duration: '20s', target: 20 }, { duration: '40s', target: 20 }, { duration: '10s', target: 0 }] } },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'] };
export default function () {
  const email = `lt${rnd(1, 5000)}@loadtest.edu`;
  const r = http.post(`${API}/auth/v1/otp`, JSON.stringify({ email, create_user: true }), { headers: { 'Content-Type': 'application/json', apikey: ANON } });
  if (r.status === 200) ok.add(1); else if (r.status === 429) limited.add(1); else { other.add(1); if (__ITER < 3) console.log('otp status', r.status, (r.body || '').slice(0, 120)); }
  const v = http.post(`${API}/auth/v1/verify`, JSON.stringify({ type: 'email', email, token: '000000' }), { headers: { 'Content-Type': 'application/json', apikey: ANON } });
  sleep(1);
}
