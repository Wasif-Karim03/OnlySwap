// test-inbox Edge Function (P14-E2E-00). STAGING AND LOCAL ONLY: the handler
// answers 404 on production, and release.yml never deploys it (checked by
// scripts/verify/check-staging-migrations.mjs). Logic: ../_shared/testInbox.ts.
//   POST {email} with header x-e2e-secret → {code}
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

import { withMonitoring } from '../_shared/monitor.ts';
import { handleTestInbox } from '../_shared/testInbox.ts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

Deno.serve(
  withMonitoring(
    'test-inbox',
    async (req) => {
      let body: unknown = null;
      try {
        body = await req.json();
      } catch {
        body = null;
      }
      const res = await handleTestInbox(
        { method: req.method, secretHeader: req.headers.get('x-e2e-secret'), body },
        {
          appEnv: Deno.env.get('APP_ENV'),
          supabaseUrl: Deno.env.get('SUPABASE_URL'),
          secret: Deno.env.get('E2E_SECRET'),
          generateOtp: async (email) => {
            const { data, error } = await admin.auth.admin.generateLink({
              type: 'magiclink',
              email,
            });
            return error ? null : (data.properties?.email_otp ?? null);
          },
        },
      );
      return new Response(JSON.stringify(res.body), {
        status: res.status,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    },
    Deno.env,
  ),
);
