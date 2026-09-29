// upload-url Edge Function (P5-MEDIA-02, API §5). POST with the user's JWT:
//   { kind: 'listing' | 'avatar' | 'share', target_id, files: [{ idx, variant, type, size }] }
// → { uploads: [{ idx, variant, key, url, headers }], expires_in }
// Logic: ../_shared/uploadUrl.ts. Ownership and the 60/h limit are checked in
// SQL (private.can_upload, private.hit_key) over the direct DB connection.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import postgres from 'npm:postgres@3.4.7';

import { createR2, r2FromEnv } from '../_shared/r2.ts';
import { handleUploadUrl } from '../_shared/uploadUrl.ts';
import { withMonitoring } from '../_shared/monitor.ts';

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
          authorize: async (userId, kind, targetId) => {
            const rows = await sql`
          select private.hit_key(${userId}::uuid, 'upload', 60, interval '1 hour'),
                 private.can_upload(${userId}::uuid, ${kind}, ${targetId}::uuid) as campus`;
            return String(rows[0].campus);
          },
          presignPut: (key, type, size) => r2.presignPut(key, type, size),
          uuid: () => crypto.randomUUID(),
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
