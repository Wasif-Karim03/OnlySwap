// support-request Edge Function (P4-AUTH-19, API §5, F20). Anonymous POST:
//   { email, topic, body, turnstile_token? } → { ok: true }
// Logic: ../_shared/support.ts. Validation, the 3/h IP limit, storage and the
// email to the owner happen in SQL (private.record_support_request).
import postgres from 'npm:postgres@3.4.7';

import { handleSupport } from '../_shared/support.ts';
import { clientIp, CORS_HEADERS, turnstileVerify } from '../_shared/waitlist.ts';
import { withMonitoring } from '../_shared/monitor.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY') ?? '';

Deno.serve(
  withMonitoring(
    'support-request',
    async (req) => {
      let body: unknown = null;
      if (req.method === 'POST') {
        try {
          body = await req.json();
        } catch {
          body = null;
        }
      }
      const res = await handleSupport(
        { method: req.method, origin: req.headers.get('origin'), ip: clientIp(req.headers), body },
        {
          verifyTurnstile: (token, ip) =>
            turnstileSecret ? turnstileVerify(turnstileSecret, token, ip) : Promise.resolve(false),
          record: async (email, topic, text, ip) => {
            await sql`select private.record_support_request(${email}, ${topic}, ${text}, ${ip})`;
          },
          log: (event) => console.log(JSON.stringify({ event })),
        },
      );
      return new Response(res.status === 204 ? null : JSON.stringify(res.body), {
        status: res.status,
        headers: { 'content-type': 'application/json', ...CORS_HEADERS },
      });
    },
    Deno.env,
  ),
);
