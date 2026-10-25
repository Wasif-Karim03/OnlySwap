// scan-photos Edge Function (DEC 152). Internal: the `scan_photos` cron calls
// it every minute while photos wait in private.photo_scans.
//   {} -> { ok, claimed, passed, flagged, retried } or { ok, skipped: 'not_configured' }
// Settings: CF_ACCOUNT_ID and CF_AI_TOKEN (a Cloudflare API token with
// Workers AI Read; free plan, 10,000 neurons a day), MEDIA_URL (public media
// base). Accept Meta's Llama license once with a {"prompt":"agree"} request
// (docs/runbooks/photo-screening.md).
import postgres from 'npm:postgres@3.4.7';

import { withMonitoring } from '../_shared/monitor.ts';
import {
  handleScanPhotos,
  toDataUri,
  workersAiClassifier,
  type ScanRow,
} from '../_shared/photoScan.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
const keys = [Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('INTERNAL_FUNCTION_KEY')];
const account = Deno.env.get('CF_ACCOUNT_ID') ?? '';
const token = Deno.env.get('CF_AI_TOKEN') ?? '';
const media = (Deno.env.get('MEDIA_URL') ?? '').replace(/\/+$/, '');

Deno.serve(
  withMonitoring(
    'scan-photos',
    async (req) => {
      const res = await handleScanPhotos(
        { method: req.method, authorization: req.headers.get('authorization') },
        {
          keys,
          configured: account !== '' && token !== '' && media !== '',
          claim: async (n) => {
            const rows = await sql`select private.claim_photo_scans(${n}) as j`;
            return (rows[0]?.j ?? []) as ScanRow[];
          },
          finish: async (id, v) => {
            await sql`select private.finish_photo_scan(${id}, ${v.verdict}, ${v.reason ?? null})`;
          },
          image: async (path) => {
            const r = await fetch(`${media}/${path.split('/').map(encodeURIComponent).join('/')}`);
            if (!r.ok) throw new Error(`media ${r.status}`);
            return toDataUri(
              new Uint8Array(await r.arrayBuffer()),
              r.headers.get('content-type') ?? '',
            );
          },
          classify: workersAiClassifier(account, token),
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
