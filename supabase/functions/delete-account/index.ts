// delete-account Edge Function (P4-DEL-01, API §5). POST with the user's JWT:
//   { "confirm": "DELETE" }   normal deletion (Settings, F16)
//   { "mode": "underage" }    after confirm_age blocked the account (F02)
// The logic lives in ../_shared/deleteAccount.ts; this file only wires Deno,
// the service-role Auth client and a direct database connection (the helper
// is in the private schema, which the Data API never exposes).
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import postgres from 'npm:postgres@3.4.7';

import { handleDeleteAccount, type Prepared } from '../_shared/deleteAccount.ts';
import { createR2, r2FromEnv } from '../_shared/r2.ts';
import { CORS_HEADERS } from '../_shared/waitlist.ts';
import { withMonitoring } from '../_shared/monitor.ts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
// R2 is required in staging and production; without it the account is still
// deleted but media stays behind, so the log says so loudly.
let r2cfg: ReturnType<typeof r2FromEnv> | null = null;
try {
  r2cfg = r2FromEnv(Deno.env);
} catch (e) {
  console.error(JSON.stringify({ event: 'delete_account.r2_not_configured', detail: String(e) }));
}
const r2 = r2cfg ? createR2(r2cfg) : null;

Deno.serve(
  withMonitoring(
    'delete-account',
    async (req) => {
      // The web deletion page (W04, P13-WEB-05) calls this from the browser with the
      // user's own token; no cookies are involved, so any origin is fine.
      if (req.method === 'OPTIONS')
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      let body: unknown = null;
      try {
        body = await req.json();
      } catch {
        body = null;
      }

      const res = await handleDeleteAccount(
        { method: req.method, authorization: req.headers.get('authorization'), body },
        {
          userIdFromToken: async (token) => {
            const { data, error } = await admin.auth.getUser(token);
            return error ? null : (data.user?.id ?? null);
          },
          prepare: async (userId, underage) => {
            const rows =
              await sql`select private.prepare_account_deletion(${userId}::uuid, ${underage}) as r`;
            return rows[0].r as Prepared;
          },
          ...(r2 && r2cfg
            ? {
                copyToPrivate: (fromKey: string, toKey: string) =>
                  r2.copy(r2cfg.mediaBucket, fromKey, r2cfg.privateBucket, toKey),
                recordMoves: async (moves: unknown) => {
                  await sql`select private.record_evidence_moves(${sql.json(moves as never)})`;
                },
                deleteR2Prefix: async (prefix: string) => {
                  await r2.deletePrefix(r2cfg.mediaBucket, prefix);
                },
              }
            : {}),
          deleteUser: async (userId) => {
            const { error } = await admin.auth.admin.deleteUser(userId);
            if (error) throw error;
          },
          // No user ids or emails in logs (SECURITY §6).
          log: (event, data) => console.log(JSON.stringify({ event, ...data })),
        },
      );

      return new Response(JSON.stringify(res.body), {
        status: res.status,
        headers: { 'content-type': 'application/json', ...CORS_HEADERS },
      });
    },
    Deno.env,
  ),
);
