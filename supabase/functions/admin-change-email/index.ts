// admin-change-email Edge Function (P4-AUTH-19, API §5, PM-03). Internal:
// called by public.admin_change_email through pg_net with the service key.
//   { user_id, new_email } → { ok }
// The address is set unconfirmed; the person confirms it by signing in with a
// code sent to it. Old sessions are revoked. The on_auth_user_email_changed
// trigger moves the profile to the new address's campus.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import postgres from 'npm:postgres@3.4.7';

import { handleAdminChangeEmail } from '../_shared/internal.ts';
import { withMonitoring } from '../_shared/monitor.ts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
const keys = [Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('INTERNAL_FUNCTION_KEY')];

Deno.serve(
  withMonitoring(
    'admin-change-email',
    async (req) => {
      let body: unknown = null;
      try {
        body = await req.json();
      } catch {
        body = null;
      }
      const res = await handleAdminChangeEmail(
        { method: req.method, authorization: req.headers.get('authorization'), body },
        {
          keys,
          updateEmail: async (userId, email) => {
            const { error } = await admin.auth.admin.updateUserById(userId, {
              email,
              email_confirm: false,
            });
            if (error) throw error;
          },
          revoke: async (userId) => {
            const rows = await sql`select private.revoke_sessions(${userId}::uuid) as n`;
            return Number(rows[0]?.n ?? 0);
          },
        },
      );
      if (res.status >= 500) console.log(JSON.stringify({ event: 'admin_change_email.failed' }));
      return new Response(JSON.stringify(res.body), {
        status: res.status,
        headers: { 'content-type': 'application/json' },
      });
    },
    Deno.env,
  ),
);
