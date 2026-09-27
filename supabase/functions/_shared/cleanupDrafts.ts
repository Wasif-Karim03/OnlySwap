// cleanup-drafts core (P5-SELL-07, DATA_MODEL §6 cleanup). No imports, so the
// Edge Function (Deno) and Node tests run the same code.
//
// Photos upload under a reserved listing id before the listing exists. When a
// draft is never posted, its folder c/{campus}/l/{id}/ is orphaned; after
// 24 h this deletes it and then forgets the reservation. Internal only: the
// daily `prune` cron job calls it with the service key.
import { isServiceCaller, type InternalResponse } from './internal.ts';

export type StaleReservation = { id: string; campusIds: string[] };

export type CleanupDeps = {
  keys: (string | undefined)[];
  /** private.stale_draft_reservations (oldest first). */
  stale: () => Promise<StaleReservation[]>;
  /** Deletes every object under the prefix; returns how many. */
  deletePrefix: (prefix: string) => Promise<number>;
  /** private.forget_reservations; only after the objects are gone. */
  forget: (ids: string[]) => Promise<number>;
  log?: (event: string) => void;
};

export async function handleCleanupDrafts(
  req: { method: string; authorization: string | null },
  deps: CleanupDeps,
): Promise<InternalResponse> {
  if (req.method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
  if (!isServiceCaller(req.authorization, deps.keys)) {
    return { status: 401, body: { error: 'NOT_AUTHENTICATED' } };
  }
  let rows: StaleReservation[];
  try {
    rows = await deps.stale();
  } catch {
    return { status: 500, body: { error: 'UNKNOWN' } };
  }
  const cleaned: string[] = [];
  let objects = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      for (const campus of row.campusIds) {
        objects += await deps.deletePrefix(`c/${campus}/l/${row.id}/`);
      }
      cleaned.push(row.id);
    } catch {
      // Keep the reservation so tomorrow's run tries again.
      failed += 1;
    }
  }
  let forgotten = 0;
  if (cleaned.length > 0) {
    try {
      forgotten = await deps.forget(cleaned);
    } catch {
      return { status: 500, body: { error: 'UNKNOWN' } };
    }
  }
  if (failed > 0) deps.log?.('cleanup_drafts.partial');
  return { status: 200, body: { ok: true, drafts: forgotten, objects, failed } };
}
