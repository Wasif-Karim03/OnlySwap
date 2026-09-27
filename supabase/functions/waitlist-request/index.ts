// waitlist-request Edge Function (P4-AUTH-11, API §5). Anonymous POST:
//   { email, turnstile_token? } → { ok: true }
// Logic: ../_shared/waitlist.ts. The IP limit (5/h), de-duplication and
// encryption happen in SQL (private.record_waitlist_request) over the direct
// DB connection. TURNSTILE_SECRET_KEY is a function secret (SECURITY §secrets).
import postgres from 'npm:postgres@3.4.7';

import { clientIp, CORS_HEADERS, handleWaitlist, turnstileVerify } from '../_shared/waitlist.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY') ?? '';

Deno.serve(async (req) => {
  let body: unknown = null;
  if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch {
      body = null;
    }
  }
  const res = await handleWaitlist(
    { method: req.method, origin: req.headers.get('origin'), ip: clientIp(req.headers), body },
    {
      // Without a configured secret every browser request is refused.
      verifyTurnstile: (token, ip) =>
        turnstileSecret ? turnstileVerify(turnstileSecret, token, ip) : Promise.resolve(false),
      record: async (email, ip) => {
        await sql`select private.record_waitlist_request(${email}, ${ip})`;
      },
      log: (event, data) => console.log(JSON.stringify({ event, ...data })),
    },
  );
  return new Response(res.status === 204 ? null : JSON.stringify(res.body), {
    status: res.status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
});
