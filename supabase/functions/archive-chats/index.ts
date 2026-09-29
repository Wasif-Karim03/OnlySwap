// archive-chats Edge Function (P9-CRON-01; DATA_MODEL §5, §6). Internal: the
// daily `archive_chats` cron calls it when chats closed over 90 days ago wait.
// Each chat's JSON goes to R2 `archive/chats/{id}.json` (private bucket), and
// only after that write succeeds are its messages removed from the database.
//   {} → { ok, archived, failed }
import postgres from 'npm:postgres@3.4.7';

import { isServiceCaller } from '../_shared/internal.ts';
import { createR2, r2FromEnv } from '../_shared/r2.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
const keys = [Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('INTERNAL_FUNCTION_KEY')];
const r2cfg = r2FromEnv(Deno.env);
const r2 = createR2(r2cfg);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('{"error":"METHOD_NOT_ALLOWED"}', { status: 405 });
  if (!isServiceCaller(req.headers.get('authorization'), keys)) {
    return new Response('{"error":"NOT_AUTHENTICATED"}', { status: 401 });
  }
  const rows = await sql`select private.chats_to_archive(50) as j`;
  const chats = (rows[0]?.j ?? []) as { id: string; chat: unknown; messages: unknown[] }[];
  let archived = 0;
  let failed = 0;
  for (const c of chats) {
    try {
      await r2.put(r2cfg.privateBucket, `archive/chats/${c.id}.json`, JSON.stringify(c));
      await sql`select private.finish_chat_archive(${c.id}::uuid)`;
      archived += 1;
    } catch {
      failed += 1; // stays in the database; tomorrow's run tries again
    }
  }
  console.log(JSON.stringify({ event: 'archive-chats', archived, failed }));
  return new Response(JSON.stringify({ ok: true, archived, failed }), {
    headers: { 'content-type': 'application/json' },
  });
});
