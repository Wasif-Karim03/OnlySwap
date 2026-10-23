// upload-url Edge Function (P5-MEDIA-02, API §5). POST with the user's JWT:
//   { kind: 'listing' | 'avatar' | 'share' | 'quad' | 'chat', target_id, files: [{ idx, variant, type, size }] }
// → { uploads: [{ idx, variant, key, url, headers }], expires_in }
// Logic: ../_shared/uploadUrl.ts. The deletion gate, the 60/h and 120/day
// limits and ownership (private.authorize_upload), then the 160-object quota
// and the inventory rows (private.record_uploads, 0246), are checked in SQL
// over the direct DB connection before any URL is signed.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import postgres from 'npm:postgres@3.4.7';

import { createR2, r2FromEnv } from '../_shared/r2.ts';
import { handleUploadUrl } from '../_shared/uploadUrl.ts';
import { withMonitoring } from '../_shared/monitor.ts';
import { CORS_HEADERS } from '../_shared/waitlist.ts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
const r2 = createR2(r2FromEnv(Deno.env));

Deno.serve(
  withMonitoring(
    'upload-url',
    async (req) => {
      // The student web app (P13-WEB-07) calls this from the browser.
      if (req.method === 'OPTIONS')
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      let body: unknown = null;
      try {
        body = await req.json();
      } catch {
        body = null;
      }
      const res = await handleUploadUrl(
        { method: req.method, authorization: req.headers.get('authorization'), body },
        {
          userIdFromToken: async (token) => {
            const { data, error } = await admin.auth.getUser(token);
            return error ? null : (data.user?.id ?? null);
          },
          authorize: async (userId, kind, targetId, count) => {
            const rows = await sql`
          select private.authorize_upload(${userId}::uuid, ${kind}, ${targetId}::uuid, ${count}::int) as campus`;
            return String(rows[0].campus);
          },
          recordUploads: async (userId, kind, targetId, items) => {
            await sql`
          select private.record_uploads(${userId}::uuid, ${kind}, ${targetId}::uuid, ${sql.json(items as never)})`;
          },
          presignPut: (key, type, size) => r2.presignPut(key, type, size),
          uuid: () => crypto.randomUUID(),
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
