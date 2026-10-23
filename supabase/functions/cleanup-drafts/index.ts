// cleanup-drafts Edge Function (P5-SELL-07, 0246, DATA_MODEL §6 cleanup).
// Internal: the 6-hourly `gc_uploads` cron job calls it through pg_net with
// the service key when stale uploads or due manifest sweeps exist.
//   {} → { ok, collected, failed, sweeps, archives, more }
// Logic: ../_shared/cleanupDrafts.ts. Leases, acks, sweep progress and
// sweeps go over the direct DB connection; objects are deleted in R2 key by
// key, manifests by prefix, withheld chat archives in the private bucket
// (RV-01), and swept public URLs purged from the edge cache when configured.
// Every R2 call is cancelled by the signal it is given. Queries are never
// cancelled (IR3-R4): the single-connection pool belongs to one request and
// is closed at once when it ends (IR3-R6), so a query left hanging can never
// hold up the next request.
import postgres from 'npm:postgres@3.4.7';

import { purgeConfigFromEnv, purgeKeys } from '../_shared/cachePurge.ts';
import { handleCleanupDrafts, type SweepDue } from '../_shared/cleanupDrafts.ts';
import { createR2, r2FromEnv } from '../_shared/r2.ts';
import { createRequestDb } from '../_shared/requestDb.ts';
import { withMonitoring } from '../_shared/monitor.ts';

const dbUrl = Deno.env.get('SUPABASE_DB_URL')!;
const withDb = createRequestDb(() => postgres(dbUrl, { max: 1, prepare: false }));
const keys = [Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('INTERNAL_FUNCTION_KEY')];
const r2cfg = r2FromEnv(Deno.env);
const r2 = createR2(r2cfg);
// Edge cache purge (LR-02) needs the zone; on workers.dev nothing is cached.
const purgeCfg = purgeConfigFromEnv(Deno.env);

Deno.serve(
  withMonitoring(
    'cleanup-drafts',
    (req) =>
      withDb(async (sql) => {
        // Database deps ignore the signal: it only ends the wait (IR3-R4).
        const res = await handleCleanupDrafts(
          { method: req.method, authorization: req.headers.get('authorization') },
          {
            keys,
            claimStale: async (limit) => {
              const rows = await sql`select key, token::text as token
                                       from private.claim_stale_uploads(${limit}::int)`;
              return rows.map((r) => ({ key: r.key as string, token: r.token as string }));
            },
            deleteKey: (key, signal) => r2.delete(r2cfg.mediaBucket, key, signal),
            ackCollected: async (items) => {
              const rows =
                await sql`select private.ack_collected(${sql.json(items as never)}) as n`;
              return Number(rows[0]?.n ?? 0);
            },
            sweepsDue: async () => {
              const rows = await sql`select private.media_sweeps_due() as due`;
              return (rows[0]?.due ?? []) as SweepDue[];
            },
            deleteUnder: (prefix, opts) => r2.deleteUnder(r2cfg.mediaBucket, prefix, opts),
            saveSweepProgress: async (item) =>
              Number(
                (
                  await sql`select private.save_media_sweep_progress(${item.id}::uuid, ${item.gen}::int, ${item.pos}::int) as n`
                )[0]?.n ?? 0,
              ),
            finishSweeps: async (items) => {
              const rows =
                await sql`select private.finish_media_sweeps(${sql.json(items as never)}) as n`;
              return Number(rows[0]?.n ?? 0);
            },
            ...(purgeCfg
              ? {
                  purge: (k: string[], signal: AbortSignal) =>
                    purgeKeys(purgeCfg, k, fetch, signal),
                }
              : {}),
            archiveCleanupsDue: async () => {
              const rows = await sql`select private.archive_cleanups_due() as due`;
              return (rows[0]?.due ?? []) as { id: string; token: string; key: string }[];
            },
            deletePrivate: (key, signal) => r2.delete(r2cfg.privateBucket, key, signal),
            finishArchiveCleanups: async (items) => {
              const rows =
                await sql`select private.finish_archive_cleanups(${sql.json(items as never)}) as n`;
              return Number(rows[0]?.n ?? 0);
            },
            // Counts only; no ids or keys in logs (SECURITY §6).
            log: (event) => console.log(JSON.stringify({ event })),
          },
        );
        return new Response(JSON.stringify(res.body), {
          status: res.status,
          headers: { 'content-type': 'application/json' },
        });
      }),
    Deno.env,
  ),
);
