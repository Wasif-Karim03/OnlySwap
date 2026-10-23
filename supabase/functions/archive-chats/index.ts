// archive-chats Edge Function (P9-CRON-01; DATA_MODEL §5, §6). Internal: the
// daily `archive_chats` cron calls it when chats closed over 90 days ago wait.
// Each chat is claimed by one run (RV-01), its JSON goes to R2 under the key
// the claim hands out for that job token (`archive/chats/{id}/{token}.json`,
// private bucket, IR3-01), and only after that write succeeds are its
// messages removed from the database, unless someone in the chat is deleting
// their account (IR-04) or the job was taken over: then the object is deleted
// again, or left on the durable cleanup list for cleanup-drafts when that
// fails.
// Logic: ../_shared/archiveChats.ts.
//   {} → { ok, archived, failed, withheld }
import postgres from 'npm:postgres@3.4.7';

import { archiveChats, type ArchiveRow, type FinishResult } from '../_shared/archiveChats.ts';
import { isServiceCaller } from '../_shared/internal.ts';
import { createR2, r2FromEnv } from '../_shared/r2.ts';
import { withMonitoring } from '../_shared/monitor.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
const keys = [Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('INTERNAL_FUNCTION_KEY')];
const r2cfg = r2FromEnv(Deno.env);
const r2 = createR2(r2cfg);

Deno.serve(
  withMonitoring(
    'archive-chats',
    async (req) => {
      if (req.method !== 'POST')
        return new Response('{"error":"METHOD_NOT_ALLOWED"}', { status: 405 });
      if (!isServiceCaller(req.headers.get('authorization'), keys)) {
        return new Response('{"error":"NOT_AUTHENTICATED"}', { status: 401 });
      }
      const rows = await sql`select private.claim_chat_archives(50) as j`;
      const chats = (rows[0]?.j ?? []) as ArchiveRow[];
      const tally = await archiveChats(chats, {
        put: (key, body) => r2.put(r2cfg.privateBucket, key, body),
        finish: async (chatId, people, token) => {
          // An array literal of uuids (peopleIn keeps only non-empty strings).
          const list = `{${people.join(',')}}`;
          const res =
            await sql`select private.finish_chat_archive_checked(${chatId}::uuid, ${list}::uuid[], ${token}::uuid) as r`;
          return res[0]?.r as FinishResult;
        },
        remove: (key) => r2.delete(r2cfg.privateBucket, key),
        cleaned: async (items) => {
          const res =
            await sql`select private.finish_archive_cleanups(${sql.json(items as never)}) as n`;
          return Number(res[0]?.n ?? 0);
        },
      });
      console.log(JSON.stringify({ event: 'archive-chats', ...tally }));
      return new Response(JSON.stringify({ ok: true, ...tally }), {
        headers: { 'content-type': 'application/json' },
      });
    },
    Deno.env,
  ),
);
