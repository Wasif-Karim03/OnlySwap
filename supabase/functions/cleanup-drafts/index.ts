// cleanup-drafts Edge Function (P5-SELL-07, DATA_MODEL §6 cleanup). Internal:
// the daily `prune` cron job calls it through pg_net with the service key.
//   {} → { ok, drafts, objects, failed }
// Logic: ../_shared/cleanupDrafts.ts. The reservations are read and forgotten
// over the direct DB connection; the photo folders are deleted in R2.
import postgres from 'npm:postgres@3.4.7';

import { handleCleanupDrafts } from '../_shared/cleanupDrafts.ts';
import { createR2, r2FromEnv } from '../_shared/r2.ts';
import { withMonitoring } from '../_shared/monitor.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
const keys = [Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('INTERNAL_FUNCTION_KEY')];
const r2cfg = r2FromEnv(Deno.env);
const r2 = createR2(r2cfg);

Deno.serve(
  withMonitoring(
    'cleanup-drafts',
    async (req) => {
      const res = await handleCleanupDrafts(
        { method: req.method, authorization: req.headers.get('authorization') },
        {
          keys,
          stale: async () => {
            const rows = await sql`select id::text, campus_ids::text[] as campus_ids
                               from private.stale_draft_reservations(200)`;
            return rows.map((r) => ({ id: r.id as string, campusIds: r.campus_ids as string[] }));
          },
          deletePrefix: (prefix) => r2.deletePrefix(r2cfg.mediaBucket, prefix),
          forget: async (ids) => {
            const rows = await sql`select private.forget_reservations(${ids}::uuid[]) as n`;
            return Number(rows[0]?.n ?? 0);
          },
          // Counts only; no ids in logs (SECURITY §6).
          log: (event) => console.log(JSON.stringify({ event })),
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
