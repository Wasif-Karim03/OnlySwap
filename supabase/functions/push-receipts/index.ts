// push-receipts Edge Function (P9-PUSH-03; API §5). Internal: the
// `push_receipts` cron calls it every 15 minutes when tickets are waiting.
//   {} → { ok, checked, disabled }
import postgres from 'npm:postgres@3.4.7';

import {
  EXPO_RECEIPTS,
  handlePushReceipts,
  type PendingReceipt,
  type Receipt,
} from '../_shared/push.ts';
import { withMonitoring } from '../_shared/monitor.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
const keys = [Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('INTERNAL_FUNCTION_KEY')];
const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');

Deno.serve(
  withMonitoring(
    'push-receipts',
    async (req) => {
      const res = await handlePushReceipts(
        { method: req.method, authorization: req.headers.get('authorization') },
        {
          keys,
          pending: async () => {
            const rows = await sql`select private.pending_receipts(1000) as j`;
            return (rows[0]?.j ?? []) as PendingReceipt[];
          },
          finish: async (results) => {
            await sql`select private.finish_receipts(${sql.json(results)}::jsonb)`;
          },
          receipts: async (ids) => {
            const r = await fetch(EXPO_RECEIPTS, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                ...(expoToken ? { authorization: `Bearer ${expoToken}` } : {}),
              },
              body: JSON.stringify({ ids }),
            });
            if (!r.ok) throw new Error(`expo ${r.status}`);
            return ((await r.json()) as { data: Record<string, Receipt> }).data ?? {};
          },
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
