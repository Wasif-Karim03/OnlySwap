// send-push Edge Function (P9-PUSH-03; API §5). Internal: the `notify_push`
// cron calls it through pg_net with the service key when pushes are due.
//   {} → { ok, claimed, sent, failed }
// Logic: ../_shared/push.ts. Claims and results go over the direct DB
// connection (private.claim_pushes / private.finish_pushes).
import postgres from 'npm:postgres@3.4.7';

import { EXPO_SEND, handleSendPush, type ClaimedPush, type Ticket } from '../_shared/push.ts';
import { withMonitoring } from '../_shared/monitor.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
const keys = [Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('INTERNAL_FUNCTION_KEY')];
// Optional (free): Expo's "enhanced security for push" access token.
const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');

Deno.serve(
  withMonitoring(
    'send-push',
    async (req) => {
      const res = await handleSendPush(
        { method: req.method, authorization: req.headers.get('authorization') },
        {
          keys,
          claim: async (limit) => {
            const rows = await sql`select private.claim_pushes(${limit}) as j`;
            return (rows[0]?.j ?? []) as ClaimedPush[];
          },
          finish: async (results) => {
            await sql`select private.finish_pushes(${sql.json(results)}::jsonb)`;
          },
          send: async (messages) => {
            const r = await fetch(EXPO_SEND, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                accept: 'application/json',
                ...(expoToken ? { authorization: `Bearer ${expoToken}` } : {}),
              },
              body: JSON.stringify(messages),
            });
            if (!r.ok) throw new Error(`expo ${r.status}`);
            return ((await r.json()) as { data: Ticket[] }).data ?? [];
          },
          // Counts only; no tokens, ids or text in logs (SECURITY §6).
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
