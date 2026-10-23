// cleanup-drafts core: the upload GC and the deletion-manifest sweep (0246,
// DATA_MODEL §6 cleanup). Only relative _shared imports, so the Edge Function
// (Deno) and Node tests run the same code. Internal only: the 6-hourly `gc_uploads` cron job
// calls it with the service key when there is work.
//
// 1. Sweep: manifests of deleted accounts confirmed 15 minutes ago are
//    deleted again prefix by prefix (idempotent), starting at the saved
//    position `pos` (IR3-02). Progress is saved every PROGRESS_EVERY prefixes
//    and at every stop (save_media_sweep_progress never waits on a locked
//    row), the public URLs of deleted keys are purged (also the keys a
//    failing or stopped prefix removed before it ended), and the generation
//    is marked done only when every prefix went. Sweeps go first so a backlog
//    of stale uploads cannot starve a deletion.
// 2. Archives: chat archives that archive-chats wrote but had to withhold
//    (someone in the chat was deleting) and could not delete itself are
//    deleted from the private bucket and confirmed (RV-01).
// 3. Drain: claim stale uploads under a 10-minute lease (never-attached or
//    dropped keys after 24 h, including draft photos of listings never
//    posted), delete each object, and ack only the ones that went. A failed
//    key keeps its lease until it expires and is retried later; a key a
//    listing attached first is never claimed.
//
// Schedule (IR3-02): each phase has a work deadline and a tail deadline, as
// shares of the budget (sweeps 40/50 %, archives 70/80 %, drain 90/100 %).
// Queue fetches and object work stop at the work deadline, where the phase's
// own abort signal cancels the R2 request in flight (also inside a prefix:
// deleteUnder asks before every list page and object, RV-02). Tail calls
// (purge, progress save, finish, ack) run after that abort and share the
// phase's single tail deadline: each gets only the time left to it (at most
// OP_TIMEOUT_MS), and one with no time left is skipped and logged. Unused
// time flows to the next phase, so a hung request, a slow tail or a blocked
// query in one phase never starves the next. Keys done so far are acked or
// purged, the rest keep their lease, unswept manifests stay due, and the
// response says `more: true`.
//
// Database calls are never cancelled (IR3-R4): every call `cleanup-drafts`
// makes shares one connection, and a wait that times out leaves its query
// holding it. Such a timeout taints the run: no later database call is
// issued (logged as db_skipped), the phases stop, and the response is a 500
// so monitoring sees an unhealthy database. A queue fetch that fails skips
// only its phase; the run then returns 500 as well. A call skipped for lack
// of time does not change the status. A database call is only issued with at
// least DB_MIN_CALL_MS of allowance (the 2 s lock_timeout of its RPC plus a
// response margin), so an ordinary lock wait ends before the run stops
// waiting; with less it is skipped and its work stays due (`more: true`).
import { isServiceCaller, type InternalResponse } from './internal.ts';
import { deletedBeforeFailure, type DeleteUnderOptions } from './r2.ts';

export type Claimed = { key: string; token: string };
/** `pos`: the first prefix not yet swept (private.media_sweeps_due). */
export type SweepDue = { id: string; gen: number; prefixes: string[]; pos: number };
export type SweepProgress = { id: string; gen: number; pos: number };
export type ArchiveCleanup = { id: string; token: string; key: string };

export const CLAIM_BATCH = 200;
export const BUDGET_MS = 40_000;
export const OP_TIMEOUT_MS = 10_000;
/** Phase deadlines as shares of the budget: work (own abort signal), then tail. */
export const SWEEP_WORK_SHARE = 0.4;
export const SWEEP_END_SHARE = 0.5;
export const ARCHIVE_WORK_SHARE = 0.7;
export const ARCHIVE_END_SHARE = 0.8;
export const DRAIN_WORK_SHARE = 0.9;
/** Sweep progress is saved after every this many prefixes (and at every stop). */
export const PROGRESS_EVERY = 25;
/** With less than this left before a deadline a call is skipped, not issued (timer jitter). */
export const MIN_CALL_MS = 10;
/**
 * Must match the lock_timeout of the cleanup RPCs in migration 0248. The
 * DB_MIN_CALL_MS bound holds because those RPCs skip locked rows (a skipped
 * row stays due) instead of waiting on them, one by one; lock_timeout only
 * backstops a wait on any other lock.
 */
export const DB_LOCK_TIMEOUT_MS = 2_000;
/** Time for the response after a full lock wait. */
export const DB_MARGIN_MS = 500;
/** A database call with less allowance than this is skipped, not issued (R2 calls use MIN_CALL_MS). */
export const DB_MIN_CALL_MS = DB_LOCK_TIMEOUT_MS + DB_MARGIN_MS;

/**
 * Every dep gets an AbortSignal as its last argument. R2 deps cancel their
 * request when it fires; database deps only stop being waited for.
 */
export type CleanupDeps = {
  keys: (string | undefined)[];
  /** private.claim_stale_uploads (fresh keys first). */
  claimStale: (limit: number, signal: AbortSignal) => Promise<Claimed[]>;
  /** Deletes one media object; a missing object counts as deleted. */
  deleteKey: (key: string, signal: AbortSignal) => Promise<void>;
  /** private.ack_collected; only keys whose lease token is still live. */
  ackCollected: (items: Claimed[], signal: AbortSignal) => Promise<number>;
  /** private.media_sweeps_due. */
  sweepsDue: (signal: AbortSignal) => Promise<SweepDue[]>;
  /**
   * Deletes every object under the prefix; returns the keys removed. A
   * failure may carry the keys removed before it as `error.deleted` (IR-05),
   * and `error.stopped` when `opts` ended it (RV-02).
   */
  deleteUnder: (prefix: string, opts: DeleteUnderOptions) => Promise<string[]>;
  /** private.save_media_sweep_progress; 0 when not saved (locked, stale, behind). */
  saveSweepProgress: (item: SweepProgress, signal: AbortSignal) => Promise<number>;
  /** private.finish_media_sweeps for the generations fully swept. */
  finishSweeps: (items: { id: string; gen: number }[], signal: AbortSignal) => Promise<number>;
  /** Edge cache purge of swept keys (LR-02); failures are logged only. */
  purge?: (keys: string[], signal: AbortSignal) => Promise<unknown>;
  /** private.archive_cleanups_due (RV-01). */
  archiveCleanupsDue: (signal: AbortSignal) => Promise<ArchiveCleanup[]>;
  /** Deletes one object from the private bucket; a missing object counts as deleted. */
  deletePrivate: (key: string, signal: AbortSignal) => Promise<void>;
  /** private.finish_archive_cleanups for the objects confirmed gone. */
  finishArchiveCleanups: (
    items: { id: string; token: string }[],
    signal: AbortSignal,
  ) => Promise<number>;
  now?: () => number;
  budgetMs?: number;
  opTimeoutMs?: number;
  /** Least allowance for a database call (default DB_MIN_CALL_MS). */
  dbMinMs?: number;
  log?: (event: string) => void;
};

/** The call was never issued: no time left, or the database connection is tainted. */
class SkippedError extends Error {
  constructor() {
    super('skipped');
    this.name = 'SkippedError';
  }
}

/** The wait ended at its deadline; an R2 request is cancelled with it. */
class TimeoutError extends Error {
  constructor() {
    super('timeout');
    this.name = 'TimeoutError';
  }
}

type Link = { signal: AbortSignal; dispose: () => void };

/** A signal that fires after `ms` (real time) or when `outer` fires. */
function linkedSignal(outer: AbortSignal, ms: number): Link {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (outer.aborted) controller.abort();
  else outer.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(onAbort, Math.max(0, ms));
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      outer.removeEventListener('abort', onAbort);
    },
  };
}

/**
 * Runs `run` with a signal that fires after `ms` or with `outer`; rejects
 * with TimeoutError when it fires first. With no time (or `outer` already
 * fired) the call is never issued (SkippedError).
 */
async function bounded<T>(
  ms: number,
  outer: AbortSignal,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (ms <= 0 || outer.aborted) throw new SkippedError();
  const link = linkedSignal(outer, ms);
  try {
    return await new Promise<T>((resolve, reject) => {
      link.signal.addEventListener('abort', () => reject(new TimeoutError()), { once: true });
      try {
        run(link.signal).then(resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  } finally {
    link.dispose();
  }
}

/** Absolute fake-clock deadlines; `signal` fires at the work deadline (real time). */
type Phase = { work: number; end: number; signal: AbortSignal };

type Run = {
  deps: CleanupDeps;
  now: () => number;
  /** Fires when the whole budget ends (real time). */
  outer: AbortSignal;
  /** start + budget: the drain's tail deadline. */
  deadline: number;
  opTimeout: number;
  /** Least allowance for a database call. */
  dbMin: number;
  log: (event: string) => void;
  /** A database wait timed out: its query still holds the connection. */
  dbTainted: boolean;
  /** A database call failed (timed out or threw): the response is a 500. */
  dbFailed: boolean;
};

type Tally = { collected: number; failed: number; more: boolean };

/** Time a call may take: at most opTimeout and never past `deadline`; 0 = skip it. */
function allowance(run: Run, deadline: number): number {
  const left = deadline - run.now();
  return left < MIN_CALL_MS ? 0 : Math.min(run.opTimeout, left);
}

/** A database call's allowance: 0 (skip it) below dbMin, so a lock wait never outlasts it. */
function dbAllowance(run: Run, deadline: number): number {
  const ms = allowance(run, deadline);
  return ms < run.dbMin ? 0 : ms;
}

const pastWork = (run: Run, phase: Phase) => run.now() >= phase.work || phase.signal.aborted;

/** One database call, bounded by `deadline`; never cancelled, so a timeout taints the run. */
async function dbCall<T>(
  run: Run,
  deadline: number,
  call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (run.dbTainted) {
    run.log('cleanup_drafts.db_skipped');
    throw new SkippedError();
  }
  try {
    return await bounded(dbAllowance(run, deadline), run.outer, call);
  } catch (error) {
    if (error instanceof SkippedError) throw error;
    if (error instanceof TimeoutError) run.dbTainted = true;
    run.dbFailed = true;
    throw error;
  }
}

/** A queue fetch, bounded by the phase's work deadline; null when it did not return. */
async function fetchQueue<T>(
  run: Run,
  phase: Phase,
  call: (signal: AbortSignal) => Promise<T[]>,
): Promise<T[] | null> {
  try {
    return await dbCall(run, phase.work, call);
  } catch (error) {
    if (!(error instanceof SkippedError)) run.log('cleanup_drafts.db_failed');
    return null;
  }
}

/** Purges deleted keys within the phase tail (after its abort, never cancelled by it). */
async function purgeSwept(run: Run, phase: Phase, keys: string[]): Promise<void> {
  const purge = run.deps.purge;
  if (!purge || keys.length === 0) return;
  try {
    await bounded(allowance(run, phase.end), run.outer, (signal) => purge(keys, signal));
  } catch {
    run.log('cleanup_drafts.purge_failed');
  }
}

const isStopped = (error: unknown) => (error as { stopped?: unknown } | null)?.stopped === true;

/** The saved position, if it is a valid one. */
const startOf = (row: SweepDue): number =>
  Number.isInteger(row.pos) && row.pos > 0 ? Math.min(row.pos, row.prefixes.length) : 0;

/** Sweeps one manifest from its saved position; true when every prefix went. */
async function sweepOne(run: Run, phase: Phase, row: SweepDue): Promise<boolean> {
  const { deps, now } = run;
  const start = startOf(row);
  let done = start;
  let saved = start;
  // A skipped or failed save only costs an idempotent re-sweep.
  const saveProgress = async () => {
    if (done <= saved) return;
    const item = { id: row.id, gen: row.gen, pos: done };
    saved = done;
    try {
      await dbCall(run, phase.end, (signal) => deps.saveSweepProgress(item, signal));
    } catch {
      run.log('cleanup_drafts.progress_failed');
    }
  };
  for (let i = start; i < row.prefixes.length; i += 1) {
    if (run.dbTainted) return false;
    if (pastWork(run, phase)) {
      await saveProgress();
      return false;
    }
    let keys: string[];
    try {
      keys = await deps.deleteUnder(row.prefixes[i] as string, {
        stop: () => now() >= phase.work,
        signal: phase.signal,
      });
    } catch (error) {
      // Tail work: bounded by the phase end, not cancelled by its signal.
      await purgeSwept(run, phase, deletedBeforeFailure(error));
      await saveProgress();
      // Out of time part way: the manifest stays due (more), not a failure.
      if (isStopped(error) || pastWork(run, phase)) return false;
      throw error;
    }
    await purgeSwept(run, phase, keys);
    done = i + 1;
    if ((done - start) % PROGRESS_EVERY === 0) await saveProgress();
  }
  return true;
}

async function sweep(run: Run, phase: Phase): Promise<{ sweeps: number; more: boolean }> {
  const rows = await fetchQueue(run, phase, (signal) => run.deps.sweepsDue(signal));
  if (rows === null) return { sweeps: 0, more: true };
  const done: { id: string; gen: number }[] = [];
  let more = false;
  for (const row of rows) {
    try {
      if (!(await sweepOne(run, phase, row))) {
        more = true;
        break;
      }
      done.push({ id: row.id, gen: row.gen });
    } catch {
      // The generation stays due from its saved position; the next run tries again.
      run.log('cleanup_drafts.sweep_failed');
    }
  }
  if (done.length === 0) return { sweeps: 0, more };
  try {
    const sweeps = await dbCall(run, phase.end, (signal) => run.deps.finishSweeps(done, signal));
    return { sweeps, more };
  } catch {
    run.log('cleanup_drafts.finish_failed');
    return { sweeps: 0, more: true };
  }
}

/** Deletes withheld chat archives and confirms the ones gone (RV-01). */
async function cleanArchives(run: Run, phase: Phase): Promise<{ archives: number; more: boolean }> {
  const items = await fetchQueue(run, phase, (signal) => run.deps.archiveCleanupsDue(signal));
  if (items === null) return { archives: 0, more: true };
  const gone: { id: string; token: string }[] = [];
  let more = false;
  for (const item of items) {
    if (pastWork(run, phase)) {
      more = true;
      break;
    }
    try {
      await bounded(allowance(run, phase.work), phase.signal, (signal) =>
        run.deps.deletePrivate(item.key, signal),
      );
      gone.push({ id: item.id, token: item.token });
    } catch (error) {
      // Stays on the cleanup list; the next run tries again.
      run.log('cleanup_drafts.archive_failed');
      if (error instanceof TimeoutError || error instanceof SkippedError) more = true;
    }
  }
  if (gone.length === 0) return { archives: 0, more };
  try {
    const archives = await dbCall(run, phase.end, (signal) =>
      run.deps.finishArchiveCleanups(gone, signal),
    );
    return { archives, more };
  } catch {
    run.log('cleanup_drafts.finish_failed');
    return { archives: 0, more: true };
  }
}

async function drain(run: Run, phase: Phase): Promise<Tally> {
  const tally: Tally = { collected: 0, failed: 0, more: false };
  for (;;) {
    if (pastWork(run, phase)) return { ...tally, more: true };
    const batch = await fetchQueue(run, phase, (signal) =>
      run.deps.claimStale(CLAIM_BATCH, signal),
    );
    if (batch === null) return { ...tally, more: true };
    if (batch.length === 0) return tally;
    const gone: Claimed[] = [];
    let stopped = false;
    for (const item of batch) {
      // The rest of the batch keeps its lease and is reclaimed after it.
      if (pastWork(run, phase)) {
        stopped = true;
        break;
      }
      try {
        await bounded(allowance(run, phase.work), phase.signal, (signal) =>
          run.deps.deleteKey(item.key, signal),
        );
        gone.push(item);
      } catch {
        tally.failed += 1;
      }
    }
    if (gone.length > 0) {
      try {
        // The final ack is bounded by what is left of the whole budget.
        tally.collected += await dbCall(run, run.deadline, (signal) =>
          run.deps.ackCollected(gone, signal),
        );
      } catch {
        // Unacked keys keep their lease and are collected again later.
        run.log('cleanup_drafts.ack_failed');
        return { ...tally, more: true };
      }
    }
    if (stopped) return { ...tally, more: true };
  }
}

export async function handleCleanupDrafts(
  req: { method: string; authorization: string | null },
  deps: CleanupDeps,
): Promise<InternalResponse> {
  if (req.method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
  if (!isServiceCaller(req.authorization, deps.keys)) {
    return { status: 401, body: { error: 'NOT_AUTHENTICATED' } };
  }
  const now = deps.now ?? Date.now;
  const budget = deps.budgetMs ?? BUDGET_MS;
  const start = now();
  const stopper = new AbortController();
  const timer = setTimeout(() => stopper.abort(), budget);
  const links: Link[] = [];
  const phase = (workShare: number, endShare: number): Phase => {
    const link = linkedSignal(stopper.signal, budget * workShare);
    links.push(link);
    return {
      work: start + budget * workShare,
      end: start + budget * endShare,
      signal: link.signal,
    };
  };
  const run: Run = {
    deps,
    now,
    outer: stopper.signal,
    deadline: start + budget,
    opTimeout: deps.opTimeoutMs ?? OP_TIMEOUT_MS,
    dbMin: deps.dbMinMs ?? DB_MIN_CALL_MS,
    log: deps.log ?? (() => {}),
    dbTainted: false,
    dbFailed: false,
  };
  try {
    const sweepPhase = phase(SWEEP_WORK_SHARE, SWEEP_END_SHARE);
    const archivePhase = phase(ARCHIVE_WORK_SHARE, ARCHIVE_END_SHARE);
    const drainPhase = phase(DRAIN_WORK_SHARE, 1);
    const swept = await sweep(run, sweepPhase);
    const cleaned = await cleanArchives(run, archivePhase);
    const tally = await drain(run, drainPhase);
    if (tally.failed > 0) run.log('cleanup_drafts.partial');
    // A database failure is a 500 (after the other phases ran).
    if (run.dbFailed) return { status: 500, body: { error: 'UNKNOWN' } };
    return {
      status: 200,
      body: {
        ok: true,
        ...tally,
        more: tally.more || swept.more || cleaned.more,
        sweeps: swept.sweeps,
        archives: cleaned.archives,
      },
    };
  } catch {
    return { status: 500, body: { error: 'UNKNOWN' } };
  } finally {
    clearTimeout(timer);
    for (const link of links) link.dispose();
  }
}
