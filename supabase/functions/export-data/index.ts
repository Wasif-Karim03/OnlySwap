// export-data Edge Function (P11-ACC-02, API §5). POST with the user's JWT:
//   {} → { status: 'queued', expires_at }   the link arrives by email (data_export)
// 1 a day (private.start_data_export). The logic lives in
// ../_shared/exportData.ts; this file only wires Deno, the service-role Auth
// client, a direct database connection (the helpers are in the private schema,
// which the Data API never exposes) and R2 (private bucket).
// Optional MEDIA_URL (the public media Worker base) turns photo paths into links.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import postgres from 'npm:postgres@3.4.7';

import { handleExportData, type StartedExport } from '../_shared/exportData.ts';
import { createR2, r2FromEnv } from '../_shared/r2.ts';
import { CORS_HEADERS } from '../_shared/waitlist.ts';
import { withMonitoring } from '../_shared/monitor.ts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
const r2cfg = r2FromEnv(Deno.env);
const r2 = createR2(r2cfg);

Deno.serve(
  withMonitoring(
    'export-data',
    async (req) => {
      if (req.method === 'OPTIONS')
        return new Response(null, { status: 204, headers: CORS_HEADERS });

      const res = await handleExportData(
        { method: req.method, authorization: req.headers.get('authorization') },
        {
          userIdFromToken: async (token) => {
            const { data, error } = await admin.auth.getUser(token);
            return error ? null : (data.user?.id ?? null);
          },
          start: async (userId) => {
            const rows = await sql`select private.start_data_export(${userId}::uuid) as r`;
            return rows[0].r as StartedExport;
          },
          collect: async (userId) => {
            const rows = await sql`select private.export_user_data(${userId}::uuid) as r`;
            return rows[0].r as Record<string, unknown>;
          },
          upload: (key, body) => r2.put(r2cfg.privateBucket, key, body, 'application/json'),
          presignGet: (key, expiresIn) => r2.presignGet(r2cfg.privateBucket, key, expiresIn),
          finish: async (id, url) => {
            await sql`select private.finish_data_export(${id}::uuid, ${url})`;
          },
          fail: async (id) => {
            await sql`select private.fail_data_export(${id}::uuid)`;
          },
          mediaUrl: Deno.env.get('MEDIA_URL') ?? null,
          // No user ids, emails or content in logs (SECURITY §6).
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
