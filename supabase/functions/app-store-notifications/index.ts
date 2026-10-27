// app-store-notifications Edge Function (AR-04, DEC 136). Apple's App Store
// Server Notifications V2 POST { signedPayload } here (set the URL in App
// Store Connect, App Information, both Production and Sandbox). No Supabase
// JWT: Apple's signature is the check. Logic: ../_shared/appStore.ts.
import postgres from 'npm:postgres@3.4.7';

import { appleJwsVerifier, handleAppStoreNotification } from '../_shared/appStore.ts';
import { withMonitoring } from '../_shared/monitor.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
const verify = appleJwsVerifier();

Deno.serve(
  withMonitoring(
    'app-store-notifications',
    async (req) => {
      let body: unknown = null;
      if (req.method === 'POST') {
        try {
          body = await req.json();
        } catch {
          body = null;
        }
      }
      const res = await handleAppStoreNotification(
        { method: req.method, body },
        {
          verify,
          bundleId: 'app.onlyswap',
          rescind: async (id) => {
            const [row] = await sql`select private.rescind_consent(${id}) as n`;
            return Number(row?.n ?? 0);
          },
          log: (event) => console.log(JSON.stringify(event)),
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
