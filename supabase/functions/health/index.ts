// health Edge Function (P14-MON-03). Public GET for UptimeRobot and the staging
// keepalive: one `select 1` so a paused or broken database shows up as down.
//   GET → 200 {"ok":true} | 503 {"ok":false}
import postgres from 'npm:postgres@3.4.7';

import { withMonitoring } from '../_shared/monitor.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, {
  max: 1,
  prepare: false,
  idle_timeout: 20,
});

Deno.serve(
  withMonitoring(
    'health',
    async () => {
      try {
        await sql`select 1`;
        return new Response('{"ok":true}', {
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        });
      } catch {
        return new Response('{"ok":false}', {
          status: 503,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        });
      }
    },
    Deno.env,
  ),
);
