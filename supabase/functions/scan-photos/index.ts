// scan-photos Edge Function (DEC 152). Internal: the `scan_photos` cron calls
// it every minute while photos wait in private.photo_scans.
//   {} -> { ok, claimed, passed, flagged, retried } or { ok, skipped: 'not_configured' }
// Settings: MEDIA_URL (the media Worker) and SCAN_KEY (the same random value
// as the Worker's SCAN_KEY secret). The deploy scripts set both
// (docs/runbooks/photo-screening.md).
import postgres from 'npm:postgres@3.4.7';

import { withMonitoring } from '../_shared/monitor.ts';
import { handleScanPhotos, workerScanner, type ScanRow } from '../_shared/photoScan.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
const keys = [Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('INTERNAL_FUNCTION_KEY')];
const media = Deno.env.get('MEDIA_URL') ?? '';
const scanKey = Deno.env.get('SCAN_KEY') ?? '';

Deno.serve(
  withMonitoring(
    'scan-photos',
    async (req) => {
      const res = await handleScanPhotos(
        { method: req.method, authorization: req.headers.get('authorization') },
        {
          keys,
          configured: media !== '' && scanKey !== '',
          claim: async (n) => {
            const rows = await sql`select private.claim_photo_scans(${n}) as j`;
            return (rows[0]?.j ?? []) as ScanRow[];
          },
          finish: async (id, v) => {
            await sql`select private.finish_photo_scan(${id}, ${v.verdict}, ${v.reason ?? null})`;
          },
          classify: workerScanner(media, scanKey),
          log: (event, counts) => console.log(JSON.stringify({ event, ...counts })),
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
