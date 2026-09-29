// revoke-sessions Edge Function (P4-AUTH-18, API §5, ARC-01). Internal: only
// the service key may call it (the database through pg_net, other functions).
//   { user_id } → { ok, revoked }
// Logic: ../_shared/internal.ts; the sessions are deleted by
// private.revoke_sessions over the direct DB connection.
import postgres from 'npm:postgres@3.4.7';

import { handleRevokeSessions } from '../_shared/internal.ts';
import { withMonitoring } from '../_shared/monitor.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
const keys = [Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('INTERNAL_FUNCTION_KEY')];

Deno.serve(
  withMonitoring(
    'revoke-sessions',
    async (req) => {
      let body: unknown = null;
      try {
        body = await req.json();
      } catch {
        body = null;
      }
      const res = await handleRevokeSessions(
        { method: req.method, authorization: req.headers.get('authorization'), body },
        {
          keys,
          revoke: async (userId) => {
            const rows = await sql`select private.revoke_sessions(${userId}::uuid) as n`;
            return Number(rows[0]?.n ?? 0);
          },
        },
      );
      return new Response(JSON.stringify(res.body), {
        status: res.status,
        headers: { 'content-type': 'application/json' },
      });
    },
    Deno.env,
  ),
);
