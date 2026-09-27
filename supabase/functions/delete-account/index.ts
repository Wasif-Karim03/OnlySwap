// delete-account Edge Function (P4-DEL-01, API §5). POST with the user's JWT:
//   { "confirm": "DELETE" }   normal deletion (Settings, F16)
//   { "mode": "underage" }    after confirm_age blocked the account (F02)
// The logic lives in ../_shared/deleteAccount.ts; this file only wires Deno,
// the service-role Auth client and a direct database connection (the helper
// is in the private schema, which the Data API never exposes).
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import postgres from 'npm:postgres@3.4.7';

import { handleDeleteAccount, type Prepared } from '../_shared/deleteAccount.ts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });

Deno.serve(async (req) => {
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
    headers: { 'content-type': 'application/json' },
  });
});
