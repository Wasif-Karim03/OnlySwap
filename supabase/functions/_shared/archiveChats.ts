// archive-chats core (P9-CRON-01; DATA_MODEL §5, §6; IR-04, RV-01). No
// imports, so the Edge Function (Deno) and Node tests run the same code.
//
// private.claim_chat_archives hands each chat to one run only, with a token,
// a 30-minute lease and the object key for that token (IR3-01:
// `archive/chats/{chat}/{token}.json`, built only by the database, so a
// replacement run never writes over or deletes another run's object). Its
// JSON goes to R2 under that key (private bucket). Then
// private.finish_chat_archive_checked marks it archived and removes its
// messages, but only if nobody in that JSON or in the chat is deleting their
// account (it takes the lock prepare_account_deletion takes) and the token is
// still this run's:
//   archived  done.
//   withheld  the object holds data from before a deletion that has already
//             run or listed its archives. The job is now on a durable cleanup
//             list; the object is deleted here and the deletion confirmed, and
//             if either fails the upload GC (cleanup-drafts) deletes it later.
//   lost      the job was taken over after its lease ran out and put on the
//             cleanup list. The key is this run's own, so the object is
//             deleted here too and confirmed (or cleanup-drafts deletes it).
// A row without a key is counted failed and nothing is written.
// No new write starts once the budget is spent (well inside the lease); the
// rest keep their lease and are claimed again later.

export type ArchiveRow = {
  id: string;
  token: string;
  /** The object key for this job token (private.chat_archive_key). */
  key: string;
  chat: unknown;
  messages: unknown[];
};

export type FinishResult = 'archived' | 'withheld' | 'lost';

export type ArchiveDeps = {
  /** Writes one archive to the private bucket. */
  put: (key: string, body: string) => Promise<void>;
  /** private.finish_chat_archive_checked. */
  finish: (chatId: string, people: string[], token: string) => Promise<FinishResult>;
  /** Deletes one archive from the private bucket. */
  remove: (key: string) => Promise<void>;
  /** private.finish_archive_cleanups: the withheld object is gone. */
  cleaned: (items: { id: string; token: string }[]) => Promise<number>;
  now?: () => number;
  budgetMs?: number;
};

export type ArchiveTally = { archived: number; failed: number; withheld: number };

export const ARCHIVE_BUDGET_MS = 120_000;

const idOf = (value: unknown, field: string): string | null => {
  const v = (value as Record<string, unknown> | null)?.[field];
  return typeof v === 'string' && v ? v : null;
};

/** Everyone the JSON names: both participants and every message sender. */
export function peopleIn(row: ArchiveRow): string[] {
  const ids = [
    idOf(row.chat, 'buyer_id'),
    idOf(row.chat, 'seller_id'),
    ...row.messages.map((m) => idOf(m, 'sender_id')),
  ].filter((id): id is string => id !== null);
  return [...new Set(ids)].sort();
}

/** The JSON written to R2 (the job token is not part of the archive). */
const archiveBody = (row: ArchiveRow): string =>
  JSON.stringify({ id: row.id, chat: row.chat, messages: row.messages });

/** Deletes a withheld object and confirms it; a failure leaves it on the cleanup list. */
async function dropWithheld(row: ArchiveRow, deps: ArchiveDeps): Promise<boolean> {
  try {
    await deps.remove(row.key);
    await deps.cleaned([{ id: row.id, token: row.token }]);
    return true;
  } catch {
    return false;
  }
}

export async function archiveChats(rows: ArchiveRow[], deps: ArchiveDeps): Promise<ArchiveTally> {
  const now = deps.now ?? Date.now;
  const deadline = now() + (deps.budgetMs ?? ARCHIVE_BUDGET_MS);
  const tally: ArchiveTally = { archived: 0, failed: 0, withheld: 0 };
  for (const row of rows) {
    if (now() >= deadline) break;
    if (typeof row.key !== 'string' || !row.key) {
      tally.failed += 1;
      continue;
    }
    let result: FinishResult;
    try {
      await deps.put(row.key, archiveBody(row));
      result = await deps.finish(row.id, peopleIn(row), row.token);
    } catch {
      // Stays in the database with its lease; a later run claims it again
      // (an expired lease is taken over under a new token and key).
      tally.failed += 1;
      continue;
    }
    if (result === 'archived') {
      tally.archived += 1;
    } else if (result === 'withheld') {
      tally.withheld += 1;
      if (!(await dropWithheld(row, deps))) tally.failed += 1;
    } else {
      // Lost: the takeover put this token on the cleanup list, so `cleaned`
      // confirms it (or finds it already gone and returns 0).
      tally.failed += 1;
      await dropWithheld(row, deps);
    }
  }
  return tally;
}
