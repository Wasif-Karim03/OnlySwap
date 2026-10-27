// cleanup-drafts (0246): only the service key; stale uploads drained in
// leased batches within the time budget, only deleted keys acked; manifest
// sweeps deleted, purged and finished only when every prefix went; the budget
// checked before every object and prefix (IR-06) and inside a prefix, with
// the request in flight cancelled (RV-02); withheld chat archives deleted and
// confirmed (RV-01). IR3-01: archive keys are per token, so a stale cleaner
// never deletes a replacement. IR3-02: sweeps resume at their saved position,
// each phase has its own work deadline (abort signal) and one tail deadline,
// and a database timeout taints the run's single connection.
//
// Schedule for the default 40 s budget (fake clock): sweeps work until
// 16,000 ms (SWEEP_WORK_SHARE 0.4), tail until 20,000 (0.5); archives work
// until 28,000 (0.7), tail until 32,000 (0.8); drain work until 36,000
// (DRAIN_WORK_SHARE 0.9), final ack until 40,000. A database call needs
// DB_MIN_CALL_MS = 2,000 + 500 = 2,500 ms of allowance; real-clock tests with
// budgets far below that pass dbMinMs: MIN_CALL_MS (the R2 minimum) instead.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ARCHIVE_WORK_SHARE,
  BUDGET_MS,
  CLAIM_BATCH,
  DB_LOCK_TIMEOUT_MS,
  DB_MARGIN_MS,
  DB_MIN_CALL_MS,
  DRAIN_WORK_SHARE,
  handleCleanupDrafts,
  MIN_CALL_MS,
  PROGRESS_EVERY,
  SWEEP_END_SHARE,
  SWEEP_WORK_SHARE,
  type ArchiveCleanup,
  type Claimed,
  type CleanupDeps,
  type SweepDue,
  type SweepProgress,
} from './cleanupDrafts.ts';
import { archiveChats } from './archiveChats.ts';
import { createR2, R2PartialDeleteError } from './r2.ts';

const KEY = 'service-key-123';
const post = (authorization: string | null = `Bearer ${KEY}`) => ({
  method: 'POST',
  authorization,
});

const batchOf = (tag: string, n: number): Claimed[] =>
  Array.from({ length: n }, (_, i) => ({
    key: `c/1/l/R/${tag}${i}_full.webp`,
    token: `t-${tag}${i}`,
  }));

function deps(batches: Claimed[][], over: Partial<CleanupDeps> = {}) {
  const queue = [...batches];
  const claims: number[] = [];
  const deleted: string[] = [];
  const acked: Claimed[][] = [];
  const swept: string[] = [];
  const purged: string[][] = [];
  const finished: { id: string; gen: number }[][] = [];
  const archivesDone: { id: string; token: string }[][] = [];
  const progress: SweepProgress[] = [];
  const d: CleanupDeps = {
    keys: [KEY],
    claimStale: async (limit) => {
      claims.push(limit);
      return queue.shift() ?? [];
    },
    deleteKey: async (key) => {
      deleted.push(key);
    },
    ackCollected: async (items) => {
      acked.push(items);
      return items.length;
    },
    sweepsDue: async () => [],
    deleteUnder: async (prefix) => {
      swept.push(prefix);
      return [`${prefix}a_full.webp`];
    },
    saveSweepProgress: async (item) => {
      progress.push(item);
      return 1;
    },
    finishSweeps: async (items) => {
      finished.push(items);
      return items.length;
    },
    purge: async (keys) => {
      purged.push(keys);
    },
    archiveCleanupsDue: async () => [],
    deletePrivate: async () => {},
    finishArchiveCleanups: async (items) => {
      archivesDone.push(items);
      return items.length;
    },
    ...over,
  };
  return { d, claims, deleted, acked, swept, purged, finished, archivesDone, progress };
}

test('only the service key may call it, and only with POST', async () => {
  const { d } = deps([]);
  assert.equal((await handleCleanupDrafts(post('Bearer nope'), d)).status, 401);
  assert.equal((await handleCleanupDrafts(post(null), d)).status, 401);
  assert.equal(
    (await handleCleanupDrafts({ method: 'GET', authorization: `Bearer ${KEY}` }, d)).status,
    405,
  );
});

test('three batches are drained until the claim comes back empty', async () => {
  const { d, claims, deleted, acked } = deps([
    batchOf('a', 200),
    batchOf('b', 200),
    batchOf('c', 7),
  ]);
  const res = await handleCleanupDrafts(post(), d);
  assert.deepEqual(res, {
    status: 200,
    body: { ok: true, collected: 407, failed: 0, more: false, sweeps: 0, archives: 0 },
  });
  assert.deepEqual(claims, [CLAIM_BATCH, CLAIM_BATCH, CLAIM_BATCH, CLAIM_BATCH]);
  assert.equal(deleted.length, 407);
  assert.deepEqual(
    acked.map((a) => a.length),
    [200, 200, 7],
  );
});

test('IR-06 slow deletes: the drain stops inside the budget and acks the keys done', async () => {
  let clock = 0;
  const second = batchOf('b', 200);
  let deleted = 0;
  const { d, claims, acked } = deps([batchOf('a', 200), second, batchOf('c', 200)], {
    now: () => clock,
    budgetMs: 40_000,
    deleteKey: async () => {
      deleted += 1;
      clock += 150; // 200 keys = 30 s per batch
    },
  });
  const res = await handleCleanupDrafts(post(), d);
  assert.equal(res.status, 200);
  assert.equal(res.body.more, true);
  // Checked before every object: no delete starts after the drain work
  // deadline, DRAIN_WORK_SHARE × 40,000 = 36,000 ms.
  assert.ok(clock <= DRAIN_WORK_SHARE * 40_000 + 150, `stopped at ${clock} ms`);
  // 36,000 / 150 = 240 deletes: the first batch (200, until 30,000 ms) and 40 of the second.
  assert.equal(deleted, 240);
  assert.equal(res.body.collected, 240);
  assert.deepEqual(
    acked.map((a) => a.length),
    [200, 40],
  );
  // The rest of the second batch is not acked: it keeps its lease.
  assert.deepEqual(acked[1], second.slice(0, 40));
  assert.equal(claims.length, 2);
});

test('IR-06 a single delete that hangs is bounded and left to its lease', async () => {
  const batch = batchOf('a', 2);
  const { d, acked } = deps([batch], {
    opTimeoutMs: 5,
    // A database call gets at most the 5 ms op timeout: with a larger minimum
    // (DB_MIN_CALL_MS) the claim and ack would never be issued.
    dbMinMs: 5,
    deleteKey: (key) => (key === batch[0]?.key ? new Promise<void>(() => {}) : Promise.resolve()),
  });
  const res = await handleCleanupDrafts(post(), d);
  assert.equal(res.body.failed, 1);
  assert.equal(res.body.collected, 1);
  assert.deepEqual(acked, [[batch[1]]]);
});

test('IR-06 slow sweeps stop inside the budget; only finished manifests are completed', async () => {
  let clock = 0;
  const { d, swept, finished, claims } = deps([batchOf('a', 5)], {
    now: () => clock,
    budgetMs: 40_000,
    sweepsDue: async () => [
      { id: 'd1', gen: 1, prefixes: ['c/1/l/L1/', 'c/1/u/U1/'], pos: 0 },
      { id: 'd2', gen: 4, prefixes: ['c/1/l/L2/', 'c/1/u/U2/'], pos: 0 },
    ],
    deleteUnder: async (prefix) => {
      swept.push(prefix);
      // Two prefixes end at 17,000 ms: past the sweep work deadline (16,000)
      // and before its tail end (20,000), so finishSweeps still has 3,000 ms
      // (at least DB_MIN_CALL_MS, so it is issued).
      clock += 8_500;
      return [];
    },
  });
  const res = await handleCleanupDrafts(post(), d);
  assert.equal(res.body.more, true);
  assert.equal(res.body.sweeps, 1);
  assert.deepEqual(swept, ['c/1/l/L1/', 'c/1/u/U1/']);
  assert.deepEqual(finished, [[{ id: 'd1', gen: 1 }]]);
  // Later phases still run: the drain claims at 17,000 ms (work until 36,000).
  assert.deepEqual(claims, [CLAIM_BATCH, CLAIM_BATCH]);
  assert.equal(res.body.collected, 5);
});

test('sweeps run before the drain, so a backlog cannot starve a deletion', async () => {
  const order: string[] = [];
  const { d } = deps([batchOf('a', 1)], {
    sweepsDue: async () => {
      order.push('sweeps');
      return [];
    },
    claimStale: async () => {
      order.push('claim');
      return [];
    },
  });
  await handleCleanupDrafts(post(), d);
  assert.deepEqual(order, ['sweeps', 'claim']);
});

test('IR-05 a prefix that fails part way purges the keys it deleted; the sweep stays due', async () => {
  const { d, purged, finished } = deps([], {
    sweepsDue: async () => [{ id: 'd1', gen: 2, prefixes: ['c/1/u/U1/'], pos: 0 }],
    deleteUnder: async (prefix) => {
      throw Object.assign(new Error('r2 DELETE 500'), { deleted: [`${prefix}a_full.webp`] });
    },
  });
  const res = await handleCleanupDrafts(post(), d);
  assert.equal(res.body.sweeps, 0);
  assert.deepEqual(purged, [['c/1/u/U1/a_full.webp']]);
  assert.deepEqual(finished, []);
});

test('a key whose delete fails is not acked (its lease expires and it is retried)', async () => {
  const batch = batchOf('a', 3);
  const { d, acked } = deps([batch], {
    deleteKey: async (key) => {
      if (key === batch[1]?.key) throw new Error('r2 DELETE 500');
    },
  });
  const res = await handleCleanupDrafts(post(), d);
  assert.equal(res.body.collected, 2);
  assert.equal(res.body.failed, 1);
  assert.deepEqual(acked, [[batch[0], batch[2]]]);
});

test('an object already gone (404 on delete) is acked', async () => {
  const r2 = createR2(
    {
      endpoint: 'https://acct.r2.test',
      region: 'auto',
      accessKeyId: 'AK',
      secretAccessKey: 'SK',
      mediaBucket: 'onlyswap-media',
      privateBucket: 'onlyswap-private',
    },
    async () => new Response('<Error/>', { status: 404 }),
  );
  const batch = batchOf('a', 1);
  const { d, acked } = deps([batch], {
    deleteKey: (key, signal) => r2.delete('onlyswap-media', key, signal),
  });
  const res = await handleCleanupDrafts(post(), d);
  assert.equal(res.body.collected, 1);
  assert.deepEqual(acked, [batch]);
});

test('due sweeps delete every prefix, purge the deleted keys and finish with their gen', async () => {
  const { d, swept, purged, finished } = deps([], {
    sweepsDue: async () => [
      { id: 'd1', gen: 2, prefixes: ['c/1/l/L1/', 'c/1/u/U1/'], pos: 0 },
      { id: 'd2', gen: 1, prefixes: ['c/1/q/Q1/'], pos: 0 },
    ],
  });
  const res = await handleCleanupDrafts(post(), d);
  assert.equal(res.body.sweeps, 2);
  assert.deepEqual(swept, ['c/1/l/L1/', 'c/1/u/U1/', 'c/1/q/Q1/']);
  assert.deepEqual(purged, [
    ['c/1/l/L1/a_full.webp'],
    ['c/1/u/U1/a_full.webp'],
    ['c/1/q/Q1/a_full.webp'],
  ]);
  assert.deepEqual(finished, [
    [
      { id: 'd1', gen: 2 },
      { id: 'd2', gen: 1 },
    ],
  ]);
});

test('a sweep with a failing prefix is not finished; a purge failure is only logged', async () => {
  const logs: string[] = [];
  const { d, finished } = deps([], {
    sweepsDue: async () => [
      { id: 'd1', gen: 3, prefixes: ['c/1/l/L1/', 'c/1/l/BAD/'], pos: 0 },
      { id: 'd2', gen: 1, prefixes: ['c/1/l/L2/'], pos: 0 },
    ],
    deleteUnder: async (prefix) => {
      if (prefix.includes('BAD')) throw new Error('r2 down');
      return [`${prefix}a.webp`];
    },
    purge: async () => {
      throw new Error('purge 403');
    },
    log: (e) => logs.push(e),
  });
  const res = await handleCleanupDrafts(post(), d);
  assert.equal(res.status, 200);
  assert.equal(res.body.sweeps, 1);
  assert.deepEqual(finished, [[{ id: 'd2', gen: 1 }]]);
  assert.ok(logs.includes('cleanup_drafts.sweep_failed'));
  assert.ok(logs.includes('cleanup_drafts.purge_failed'));
});

test('nothing to do: nothing acked or finished', async () => {
  const { d, acked, finished } = deps([]);
  assert.deepEqual(await handleCleanupDrafts(post(), d), {
    status: 200,
    body: { ok: true, collected: 0, failed: 0, more: false, sweeps: 0, archives: 0 },
  });
  assert.deepEqual(acked, []);
  assert.deepEqual(finished, []);
});

test('a database failure is a 500', async () => {
  const { d, finished, archivesDone } = deps([], {
    sweepsDue: async () => [{ id: 'd1', gen: 1, prefixes: ['c/1/l/L1/'], pos: 0 }],
    archiveCleanupsDue: async () => [{ id: 'C1', token: 't1', key: 'archive/chats/C1/t1.json' }],
    claimStale: async () => {
      throw new Error('db down');
    },
  });
  assert.deepEqual(await handleCleanupDrafts(post(), d), {
    status: 500,
    body: { error: 'UNKNOWN' },
  });
  // The phases before the failed fetch still did their work.
  assert.deepEqual(finished, [[{ id: 'd1', gen: 1 }]]);
  assert.deepEqual(archivesDone, [[{ id: 'C1', token: 't1' }]]);
});

// RV-02: the real deleteUnder over a fake bucket holding one prefix of objects.
const r2cfg = {
  endpoint: 'https://acct.r2.test',
  region: 'auto',
  accessKeyId: 'AK',
  secretAccessKey: 'SK',
  mediaBucket: 'onlyswap-media',
  privateBucket: 'onlyswap-private',
};
const PREFIX = 'c/1/u/U1/';
const objectKeys = Array.from({ length: 5 }, (_, i) => `${PREFIX}p${i}_full.webp`);
const listing = `<ListBucketResult>${objectKeys
  .map((k) => `<Contents><Key>${k}</Key></Contents>`)
  .join('')}</ListBucketResult>`;

function bucket(onDelete: (url: string, signal?: AbortSignal | null) => Promise<void>) {
  const deletes: string[] = [];
  const f = async (url: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'GET') return new Response(listing, { status: 200 });
    await onDelete(url, init?.signal);
    deletes.push(url.replace(`${r2cfg.endpoint}/${r2cfg.mediaBucket}/`, ''));
    return new Response(null, { status: 204 });
  };
  return { r2: createR2(r2cfg, f), deletes };
}

test('RV-02 a large prefix stops between objects at the deadline; deleted keys purged, manifest left due', async () => {
  let clock = 0;
  const { r2, deletes } = bucket(async () => {
    clock += 8_500;
  });
  const { d, purged, finished, claims } = deps([batchOf('a', 3)], {
    now: () => clock,
    budgetMs: 40_000,
    sweepsDue: async () => [{ id: 'd1', gen: 2, prefixes: [PREFIX], pos: 0 }],
    deleteUnder: (prefix, opts) => r2.deleteUnder(r2cfg.mediaBucket, prefix, opts),
  });
  const res = await handleCleanupDrafts(post(), d);
  assert.equal(res.status, 200);
  assert.equal(res.body.more, true);
  assert.equal(res.body.sweeps, 0);
  // Checked before every object: 0 and 8,500 ms start, 17,000 does not (sweep
  // work ends at 16,000); the purge runs at 17,000 inside the tail (20,000).
  assert.deepEqual(deletes, objectKeys.slice(0, 2));
  assert.deepEqual(purged, [objectKeys.slice(0, 2)]);
  assert.deepEqual(finished, []);
  // The drain still runs (work until 36,000 ms).
  assert.deepEqual(claims, [CLAIM_BATCH, CLAIM_BATCH]);
  assert.equal(res.body.collected, 3);
});

test('RV-02 a delete that hangs inside a prefix is cancelled at the sweep work deadline; later phases run', async () => {
  const { r2, deletes } = bucket(
    (url, signal) =>
      new Promise<void>((resolve, reject) => {
        if (!url.endsWith('p1_full.webp')) return resolve();
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  );
  let sweepSignal: AbortSignal | undefined;
  const { d, purged, finished } = deps([batchOf('a', 1)], {
    // Real clock. Sweep work ends at 200 ms, its tail at 250; archives work
    // until 350; drain until 450 (shares of 500 ms).
    budgetMs: 500,
    dbMinMs: MIN_CALL_MS,
    sweepsDue: async () => [{ id: 'd1', gen: 2, prefixes: [PREFIX], pos: 0 }],
    deleteUnder: (prefix, opts) => {
      sweepSignal = opts.signal;
      return r2.deleteUnder(r2cfg.mediaBucket, prefix, opts);
    },
    archiveCleanupsDue: async () => [{ id: 'C1', token: 't1', key: 'archive/chats/C1/t1.json' }],
  });
  const started = Date.now();
  const res = await handleCleanupDrafts(post(), d);
  assert.ok(Date.now() - started < 2_000, 'returned soon after the budget');
  assert.equal(res.status, 200);
  assert.equal(res.body.more, true);
  assert.equal(res.body.sweeps, 0);
  assert.deepEqual(deletes, [objectKeys[0]]);
  assert.deepEqual(purged, [[objectKeys[0]]]);
  assert.deepEqual(finished, []);
  assert.equal(sweepSignal?.aborted, true);
  assert.equal(res.body.archives, 1);
  assert.equal(res.body.collected, 1);
});

test('RV-02 the purge gets a signal of its own, so it is bounded', async () => {
  let signal: AbortSignal | undefined;
  const { d } = deps([], {
    sweepsDue: async () => [{ id: 'd1', gen: 1, prefixes: ['c/1/l/L1/'], pos: 0 }],
    purge: async (_keys, s) => {
      signal = s;
    },
  });
  await handleCleanupDrafts(post(), d);
  assert.ok(signal instanceof AbortSignal);
  assert.equal(signal?.aborted, false);
});

test('RV-01 withheld chat archives are deleted and confirmed; a failed delete stays on the list', async () => {
  const logs: string[] = [];
  const removed: string[] = [];
  const { d, archivesDone } = deps([], {
    archiveCleanupsDue: async () => [
      { id: 'C1', token: 't1', key: 'archive/chats/C1/t1.json' },
      { id: 'C2', token: 't2', key: 'archive/chats/C2/t2.json' },
    ],
    deletePrivate: async (key) => {
      if (key.includes('C1')) throw new Error('r2 DELETE 500');
      removed.push(key);
    },
    log: (e) => logs.push(e),
  });
  const res = await handleCleanupDrafts(post(), d);
  assert.equal(res.status, 200);
  assert.equal(res.body.archives, 1);
  assert.deepEqual(removed, ['archive/chats/C2/t2.json']);
  // Only the one gone is confirmed; C1 stays due for the next run.
  assert.deepEqual(archivesDone, [[{ id: 'C2', token: 't2' }]]);
  assert.ok(logs.includes('cleanup_drafts.archive_failed'));
});

// IR3-01/IR3-02 ------------------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** Never settles, whatever the signal does (a database call is never cancelled). */
const forever = <T>() => new Promise<T>(() => {});

test('an archive delete started near its phase deadline is cancelled and the drain still runs', async () => {
  const logs: string[] = [];
  let archiveSignal: AbortSignal | undefined;
  const { d, archivesDone } = deps([batchOf('a', 1)], {
    // Real clock: archives work until 280 ms (ARCHIVE_WORK_SHARE × 400), the
    // drain until 360 and its ack until 400.
    budgetMs: 400,
    dbMinMs: MIN_CALL_MS,
    archiveCleanupsDue: async () => [{ id: 'C1', token: 't1', key: 'archive/chats/C1/t1.json' }],
    deletePrivate: (_key, signal) =>
      new Promise<void>((_, reject) => {
        archiveSignal = signal;
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    log: (e) => logs.push(e),
  });
  const started = Date.now();
  const res = await handleCleanupDrafts(post(), d);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 1_000, `returned after ${elapsed} ms`);
  assert.ok(elapsed >= ARCHIVE_WORK_SHARE * 400 - 5, 'the delete ran until its phase deadline');
  assert.equal(res.status, 200);
  assert.equal(res.body.archives, 0);
  assert.deepEqual(archivesDone, []);
  assert.ok(logs.includes('cleanup_drafts.archive_failed'));
  assert.equal(archiveSignal?.aborted, true);
  assert.equal(res.body.collected, 1);
  assert.equal(res.body.more, true);
});

test('purge and progress save after a stopped sweep are not cancelled by the phase abort', async () => {
  const purges: { keys: string[]; abortedAtCall: boolean }[] = [];
  const { d, progress } = deps([], {
    // Real clock: sweep work until 400 ms, its tail until 500 (shares of 1,000).
    budgetMs: 1_000,
    dbMinMs: MIN_CALL_MS,
    sweepsDue: async () => [{ id: 'd1', gen: 3, prefixes: ['c/1/l/L1/', 'c/1/u/U1/'], pos: 0 }],
    deleteUnder: (prefix, opts) =>
      prefix === 'c/1/l/L1/'
        ? Promise.resolve(['c/1/l/L1/a.webp'])
        : new Promise<string[]>((_, reject) => {
            // Deletes one key, then hangs until the phase signal fires.
            opts.signal?.addEventListener('abort', () =>
              reject(new R2PartialDeleteError(new Error('r2 stopped'), ['c/1/u/U1/b.webp'], true)),
            );
          }),
    purge: async (keys, signal) => {
      purges.push({ keys, abortedAtCall: signal.aborted });
    },
  });
  const res = await handleCleanupDrafts(post(), d);
  assert.equal(res.status, 200);
  assert.equal(res.body.sweeps, 0);
  assert.deepEqual(purges, [
    { keys: ['c/1/l/L1/a.webp'], abortedAtCall: false },
    // After the phase abort: still issued, with a live signal of its own.
    { keys: ['c/1/u/U1/b.webp'], abortedAtCall: false },
  ]);
  assert.deepEqual(progress, [{ id: 'd1', gen: 3, pos: 1 }]);
});

/** Two manifests; d2's second prefix deletes a key, then stalls until the phase abort. */
function tailFixture(over: Partial<CleanupDeps>) {
  const logs: string[] = [];
  const dbCalls: string[] = [];
  const purgedKeys: string[][] = [];
  const fixture = deps([batchOf('a', 1)], {
    // Real clock: sweep work until 800 ms, tail until 1,000; archives work
    // until 1,400, tail until 1,600; drain work until 1,800 (shares of 2,000).
    budgetMs: 2_000,
    dbMinMs: MIN_CALL_MS,
    sweepsDue: async () => {
      dbCalls.push('sweepsDue');
      return [
        { id: 'd1', gen: 1, prefixes: ['c/1/l/A/'], pos: 0 },
        { id: 'd2', gen: 5, prefixes: ['c/1/l/B/', 'c/1/u/C/'], pos: 0 },
      ];
    },
    deleteUnder: (prefix, opts) =>
      prefix === 'c/1/u/C/'
        ? new Promise<string[]>((_, reject) => {
            opts.signal?.addEventListener('abort', () =>
              reject(new R2PartialDeleteError(new Error('r2 stopped'), ['c/1/u/C/x.webp'], true)),
            );
          })
        : Promise.resolve([`${prefix}a.webp`]),
    purge: async (keys) => {
      purgedKeys.push(keys);
      await sleep(50);
    },
    saveSweepProgress: async (item) => {
      dbCalls.push('saveSweepProgress');
      fixture.progress.push(item);
      await sleep(50);
      return 1;
    },
    finishSweeps: async (items) => {
      dbCalls.push('finishSweeps');
      fixture.finished.push(items);
      await sleep(50);
      return items.length;
    },
    archiveCleanupsDue: async () => {
      dbCalls.push('archiveCleanupsDue');
      return [{ id: 'C1', token: 't1', key: 'archive/chats/C1/t1.json' }];
    },
    claimStale: async () => {
      dbCalls.push('claimStale');
      const batch = fixture.claims.length === 0 ? batchOf('a', 1) : [];
      fixture.claims.push(CLAIM_BATCH);
      return batch;
    },
    ackCollected: async (items) => {
      dbCalls.push('ackCollected');
      fixture.acked.push(items);
      return items.length;
    },
    log: (e) => logs.push(e),
    ...over,
  });
  return { ...fixture, logs, dbCalls, purgedKeys };
}

test('IR3-R2 sequential tail calls share one absolute tail deadline', async () => {
  const { d, finished, progress, purgedKeys } = tailFixture({});
  const started = Date.now();
  const res = await handleCleanupDrafts(post(), d);
  const elapsed = Date.now() - started;
  assert.equal(res.status, 200);
  assert.equal(res.body.sweeps, 1);
  assert.deepEqual(finished, [[{ id: 'd1', gen: 1 }]]);
  assert.ok(
    purgedKeys.some((k) => k.includes('c/1/u/C/x.webp')),
    'the stalled prefix is purged',
  );
  assert.deepEqual(progress, [{ id: 'd2', gen: 5, pos: 1 }]);
  assert.equal(res.body.archives, 1);
  assert.equal(res.body.collected, 1);
  assert.equal(res.body.more, true);
  assert.ok(elapsed <= 2_500, `took ${elapsed} ms`);
});

test('IR3-R2 variant A: a slow purge uses up the tail; the save and finish are skipped, not issued', async () => {
  const { d, finished, progress, logs, dbCalls } = tailFixture({
    // The stalled prefix's purge (not a database call) starts at ~800 ms and
    // takes 250 ms, so it is cut at the tail end (1,000 ms): nothing is left
    // for the database calls after it.
    purge: (keys) => sleep(keys.includes('c/1/u/C/x.webp') ? 250 : 0),
  });
  const started = Date.now();
  const res = await handleCleanupDrafts(post(), d);
  const elapsed = Date.now() - started;
  assert.equal(res.status, 200, 'a skipped tail call does not change the status');
  assert.deepEqual(progress, []);
  assert.deepEqual(finished, []);
  assert.ok(!dbCalls.includes('saveSweepProgress') && !dbCalls.includes('finishSweeps'));
  assert.ok(logs.includes('cleanup_drafts.purge_failed'));
  assert.ok(logs.includes('cleanup_drafts.progress_failed'));
  assert.ok(logs.includes('cleanup_drafts.finish_failed'));
  assert.ok(!logs.includes('cleanup_drafts.db_skipped'), 'no timeout, so no taint');
  assert.equal(res.body.sweeps, 0);
  assert.equal(res.body.archives, 1);
  assert.equal(res.body.collected, 1);
  assert.equal(res.body.more, true);
  assert.ok(elapsed <= 2_500, `took ${elapsed} ms`);
});

test('IR3-R2 variant B: a progress save that times out taints the run; no later database call', async () => {
  const fixture = tailFixture({});
  const { d, finished, archivesDone, acked, logs, dbCalls } = fixture;
  // Issued at ~850 ms with ~150 ms left; it never returns (never cancelled).
  d.saveSweepProgress = async (item) => {
    dbCalls.push('saveSweepProgress');
    fixture.progress.push(item);
    return forever<number>();
  };
  const started = Date.now();
  const res = await handleCleanupDrafts(post(), d);
  const elapsed = Date.now() - started;
  assert.deepEqual(res, { status: 500, body: { error: 'UNKNOWN' } });
  assert.deepEqual(dbCalls, ['sweepsDue', 'saveSweepProgress']);
  assert.deepEqual(finished, []);
  assert.deepEqual(archivesDone, []);
  assert.deepEqual(acked, []);
  assert.ok(logs.includes('cleanup_drafts.db_skipped'));
  assert.ok(logs.includes('cleanup_drafts.progress_failed'));
  assert.ok(elapsed <= 2_500, `took ${elapsed} ms`);
});

/**
 * One connection (postgres.js `max: 1`, no cancellation): database deps run
 * strictly one at a time in call order, and a call that never settles holds
 * the connection for good, whatever the caller's signal does.
 */
function serialDb() {
  const calls: string[] = [];
  let tail: Promise<unknown> = Promise.resolve();
  const run = <T>(name: string, work: () => Promise<T>): Promise<T> => {
    calls.push(name);
    const result = tail.then(work);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  return { run, calls };
}

test('IR3-R4 a database call that times out taints the single connection', async () => {
  const db = serialDb();
  const logs: string[] = [];
  const { d } = deps([batchOf('a', 1)], {
    // Real clock: the sweep fetch may wait until 160 ms (SWEEP_WORK_SHARE × 400).
    budgetMs: 400,
    dbMinMs: MIN_CALL_MS,
    sweepsDue: () => db.run('sweepsDue', () => forever<SweepDue[]>()),
    archiveCleanupsDue: () =>
      db.run('archiveCleanupsDue', async () => [
        { id: 'C1', token: 't1', key: 'archive/chats/C1/t1.json' },
      ]),
    finishArchiveCleanups: (items) => db.run('finishArchiveCleanups', async () => items.length),
    claimStale: () => db.run('claimStale', async () => batchOf('a', 1)),
    ackCollected: (items) => db.run('ackCollected', async () => items.length),
    log: (e) => logs.push(e),
  });
  const started = Date.now();
  const res = await handleCleanupDrafts(post(), d);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 1_000, `returned after ${elapsed} ms`);
  assert.ok(elapsed >= SWEEP_WORK_SHARE * 400 - 5, 'the fetch was waited for until its deadline');
  assert.deepEqual(res, { status: 500, body: { error: 'UNKNOWN' } });
  assert.ok(logs.includes('cleanup_drafts.db_failed'));
  assert.ok(logs.includes('cleanup_drafts.db_skipped'));
  // Nothing was queued behind the hung query.
  assert.deepEqual(db.calls, ['sweepsDue']);
});

test('IR3-R4 a progress save on a locked row returns 0 at once; the run goes on and re-sweeps later', async () => {
  const db = serialDb();
  let clock = 0;
  const prefixes = Array.from({ length: 30 }, (_, i) => `c/1/l/P${i}/`);
  const swept: string[] = [];
  const saves: SweepProgress[] = [];
  const { d } = deps([batchOf('a', 1)], {
    now: () => clock,
    budgetMs: BUDGET_MS,
    // skip locked: never saved, so the row keeps pos 0.
    sweepsDue: () => db.run('sweepsDue', async () => [{ id: 'd1', gen: 2, prefixes, pos: 0 }]),
    deleteUnder: async (prefix) => {
      swept.push(prefix);
      // 600 ms each: prefix 26 starts at 15,600 (< 16,000) and ends at
      // 16,200, so 27 go before the stop; saves at 25 and at the stop (27).
      clock += 600;
      return [];
    },
    saveSweepProgress: (item) =>
      db.run('saveSweepProgress', async () => {
        saves.push(item);
        return 0;
      }),
    archiveCleanupsDue: () =>
      db.run('archiveCleanupsDue', async () => [
        { id: 'C1', token: 't1', key: 'archive/chats/C1/t1.json' },
      ]),
    finishArchiveCleanups: (items) => db.run('finishArchiveCleanups', async () => items.length),
    claimStale: () =>
      db.run('claimStale', async () => (db.calls.includes('ackCollected') ? [] : batchOf('a', 1))),
    ackCollected: (items) => db.run('ackCollected', async () => items.length),
  });
  const res = await handleCleanupDrafts(post(), d);
  assert.equal(res.status, 200);
  assert.equal(res.body.archives, 1);
  assert.equal(res.body.collected, 1);
  assert.equal(res.body.more, true);
  assert.deepEqual(saves, [
    { id: 'd1', gen: 2, pos: PROGRESS_EVERY },
    { id: 'd1', gen: 2, pos: 27 },
  ]);
  assert.deepEqual(swept, prefixes.slice(0, 27));
  // Next invocation: nothing was saved, so it sweeps again from the start (idempotent).
  clock = 0;
  swept.length = 0;
  await handleCleanupDrafts(post(), d);
  assert.equal(swept[0], prefixes[0]);
});

test('IR3-01 a stale cleaner deletes only its own token key; the replacement archive survives', async () => {
  // A fake database of archive jobs and a fake private bucket.
  const keyOf = (chat: string, token: string) => `archive/chats/${chat}/${token}.json`;
  const jobs = new Map<string, { chat: string; token: string; state: string }>([
    ['C:t1', { chat: 'C', token: 't1', state: 'cleanup' }],
  ]);
  const objects = new Set(['archive/chats/C.json', keyOf('C', 't1')]);
  const removed: string[] = [];
  const cleanupsDue = (): ArchiveCleanup[] =>
    [...jobs.values()]
      .filter((j) => j.state === 'cleanup')
      .map((j) => ({ id: j.chat, token: j.token, key: keyOf(j.chat, j.token) }));
  const cleaner = (due: ArchiveCleanup[]) =>
    deps([], {
      archiveCleanupsDue: async () => due,
      deletePrivate: async (key) => {
        removed.push(key);
        objects.delete(key);
      },
      finishArchiveCleanups: async (items) =>
        items.filter((i) => {
          const job = jobs.get(`${i.id}:${i.token}`);
          return job?.state === 'cleanup' && jobs.delete(`${i.id}:${i.token}`);
        }).length,
    }).d;

  // Both cleaners read the cleanup list while (C, t1) is on it.
  const staleRead = cleanupsDue();
  const first = await handleCleanupDrafts(post(), cleaner(cleanupsDue()));
  assert.equal(first.body.archives, 1);
  // The chat is claimed again (t2) and archived under its own key.
  jobs.set('C:t2', { chat: 'C', token: 't2', state: 'writing' });
  const tally = await archiveChats(
    [{ id: 'C', token: 't2', key: keyOf('C', 't2'), chat: { id: 'C' }, messages: [] }],
    {
      put: async (key) => void objects.add(key),
      finish: async (_chat, _people, token) => {
        jobs.set(`C:${token}`, { chat: 'C', token, state: 'done' });
        return 'archived';
      },
      remove: async () => assert.fail('nothing to remove'),
      cleaned: async () => 0,
    },
  );
  assert.equal(tally.archived, 1);
  // The stale cleaner deletes what it read: t1 only, and confirms nothing.
  const stale = await handleCleanupDrafts(post(), cleaner(staleRead));
  assert.equal(stale.body.archives, 0);
  assert.deepEqual(removed, [keyOf('C', 't1'), keyOf('C', 't1')]);
  assert.ok(objects.has(keyOf('C', 't2')), 'the replacement archive survives');
  assert.ok(!removed.includes('archive/chats/C.json'), 'the legacy key is never deleted here');
  assert.equal(jobs.get('C:t2')?.state, 'done');
});

test('IR3-02 a large manifest is swept across invocations from its saved position', async () => {
  // A fake database: manifests with a saved position, finished by generation.
  const rows = new Map<string, SweepDue>([
    [
      'd1',
      { id: 'd1', gen: 1, prefixes: Array.from({ length: 1_000 }, (_, i) => `p/${i}/`), pos: 0 },
    ],
    ['d2', { id: 'd2', gen: 1, prefixes: ['q/0/', 'q/1/'], pos: 0 }],
  ]);
  let archivesDue: ArchiveCleanup[] = [{ id: 'C1', token: 't1', key: 'archive/chats/C1/t1.json' }];
  let clock = 0;
  const seen: string[] = [];
  const saves: SweepProgress[][] = [];
  let invocationSaves: SweepProgress[] = [];
  const { d } = deps([batchOf('a', 2)], {
    now: () => clock,
    sweepsDue: async () => [...rows.values()].map((r) => ({ ...r })),
    deleteUnder: async (prefix) => {
      seen.push(prefix);
      clock += 50;
      return [];
    },
    saveSweepProgress: async (item) => {
      invocationSaves.push(item);
      const row = rows.get(item.id);
      if (!row || row.gen !== item.gen || item.pos <= row.pos) return 0;
      rows.set(item.id, { ...row, pos: item.pos });
      return 1;
    },
    finishSweeps: async (items) => items.filter((i) => rows.delete(i.id)).length,
    archiveCleanupsDue: async () => archivesDue,
    finishArchiveCleanups: async (items) => {
      archivesDue = archivesDue.filter((a) => !items.some((i) => i.id === a.id));
      return items.length;
    },
  });
  const results = [];
  for (let i = 0; i < 4 && rows.size > 0; i += 1) {
    clock = 0;
    invocationSaves = [];
    results.push(await handleCleanupDrafts(post(), d));
    saves.push(invocationSaves);
  }
  const first = results[0];
  assert.equal(first?.body.more, true);
  assert.equal(first?.body.archives, 1);
  assert.ok(Number(first?.body.collected) >= 1);
  // 50 ms a prefix: 16,000 / 50 = 320 prefixes before the sweep work deadline;
  // saved every 25 prefixes (25 … 300) and once at the stop (320). Each save
  // and finish has at least 20,000 - 16,000 = 4,000 ms >= DB_MIN_CALL_MS left.
  const expected = Array.from({ length: 12 }, (_, i) => (i + 1) * PROGRESS_EVERY).concat([320]);
  assert.deepEqual(
    saves[0]?.map((s) => s.pos),
    expected,
  );
  for (const list of saves) {
    for (let i = 1; i < list.length; i += 1) {
      const step = (list[i]?.pos ?? 0) - (list[i - 1]?.pos ?? 0);
      assert.ok(step > 0 && step <= PROGRESS_EVERY, `saves monotonic, at most every 25 (${step})`);
    }
  }
  assert.equal(new Set(seen).size, seen.length, 'no prefix is swept twice');
  assert.equal(seen.length, 1_002);
  assert.equal(rows.size, 0, 'both manifests finished');
  assert.ok(results.length <= 4, `finished in ${results.length} invocations`);
});

test('a prefix failing at index k saves pos = k; the manifest stays due and the next one runs', async () => {
  const logs: string[] = [];
  const { d, progress, finished } = deps([], {
    sweepsDue: async () => [
      { id: 'd1', gen: 2, prefixes: ['c/1/l/A/', 'c/1/l/B/', 'c/1/l/BAD/', 'c/1/l/C/'], pos: 0 },
      { id: 'd2', gen: 1, prefixes: ['c/1/l/D/'], pos: 0 },
    ],
    deleteUnder: async (prefix) => {
      if (prefix.includes('BAD')) throw new Error('r2 down');
      return [`${prefix}a.webp`];
    },
    log: (e) => logs.push(e),
  });
  const res = await handleCleanupDrafts(post(), d);
  assert.equal(res.status, 200);
  assert.deepEqual(progress, [{ id: 'd1', gen: 2, pos: 2 }]);
  assert.deepEqual(finished, [[{ id: 'd2', gen: 1 }]]);
  assert.ok(logs.includes('cleanup_drafts.sweep_failed'));
});

/**
 * IR3-REVIEW-01: one manifest of two prefixes whose sweep ends at `sweptAt`
 * (fake clock, default 40 s budget), then finishSweeps meets a row lock held
 * by a concurrent prepare_account_deletion for half the RPC's lock_timeout.
 */
function lateFinish(sweptAt: number) {
  let clock = 0;
  const logs: string[] = [];
  const dbCalls: string[] = [];
  const fixture = deps([batchOf('a', 1)], {
    now: () => clock,
    budgetMs: BUDGET_MS,
    sweepsDue: async () => {
      dbCalls.push('sweepsDue');
      return [{ id: 'd1', gen: 1, prefixes: ['c/1/l/A/', 'c/1/l/B/'], pos: 0 }];
    },
    deleteUnder: async (prefix) => {
      // The second prefix starts at sweptAt / 2, before the work deadline (16,000).
      clock += sweptAt / 2;
      return [`${prefix}a.webp`];
    },
    finishSweeps: async (items) => {
      dbCalls.push('finishSweeps');
      // An ordinary finite lock wait: 1,000 ms real, under lock_timeout.
      await sleep(DB_LOCK_TIMEOUT_MS / 2);
      clock += DB_LOCK_TIMEOUT_MS / 2;
      fixture.finished.push(items);
      return items.length;
    },
    archiveCleanupsDue: async () => {
      dbCalls.push('archiveCleanupsDue');
      return [{ id: 'C1', token: 't1', key: 'archive/chats/C1/t1.json' }];
    },
    finishArchiveCleanups: async (items) => {
      dbCalls.push('finishArchiveCleanups');
      return items.length;
    },
    claimStale: async () => {
      dbCalls.push('claimStale');
      return dbCalls.includes('ackCollected') ? [] : batchOf('a', 1);
    },
    ackCollected: async (items) => {
      dbCalls.push('ackCollected');
      return items.length;
    },
    log: (e) => logs.push(e),
  });
  return { ...fixture, logs, dbCalls };
}

test('IR3-REVIEW-01 a late finishSweeps that waits on a row lock completes; no taint, later phases run', async () => {
  // The sweep tail ends at SWEEP_END_SHARE × 40,000 = 20,000 ms. Swept at
  // 17,000, finishSweeps gets min(OP_TIMEOUT_MS, 3,000) = 3,000 ms >=
  // DB_MIN_CALL_MS (2,000 + 500), so it is issued and its 1,000 ms lock wait fits.
  const sweptAt = SWEEP_END_SHARE * BUDGET_MS - (DB_MIN_CALL_MS + DB_MARGIN_MS);
  assert.equal(sweptAt, 17_000);
  const { d, finished, logs, dbCalls } = lateFinish(sweptAt);
  const res = await handleCleanupDrafts(post(), d);
  assert.deepEqual(res, {
    status: 200,
    body: { ok: true, collected: 1, failed: 0, more: false, sweeps: 1, archives: 1 },
  });
  assert.deepEqual(finished, [[{ id: 'd1', gen: 1 }]]);
  assert.deepEqual(dbCalls, [
    'sweepsDue',
    'finishSweeps',
    'archiveCleanupsDue',
    'finishArchiveCleanups',
    'claimStale',
    'ackCollected',
    'claimStale',
  ]);
  assert.ok(!logs.includes('cleanup_drafts.db_skipped'), 'no taint');
  assert.ok(!logs.includes('cleanup_drafts.finish_failed'));
});

test('IR3-REVIEW-01 with less than DB_MIN_CALL_MS left, finishSweeps is skipped, not issued; later phases run', async () => {
  // Swept at 19,500: only 20,000 - 19,500 = 500 ms of the sweep tail is left,
  // under DB_MIN_CALL_MS (2,500), so finishSweeps is never issued (before the
  // fix it was, with 500 ms, and a 1,000 ms lock wait tainted the run).
  const sweptAt = SWEEP_END_SHARE * BUDGET_MS - DB_MARGIN_MS;
  assert.equal(sweptAt, 19_500);
  const { d, finished, logs, dbCalls } = lateFinish(sweptAt);
  const res = await handleCleanupDrafts(post(), d);
  assert.deepEqual(res, {
    status: 200,
    body: { ok: true, collected: 1, failed: 0, more: true, sweeps: 0, archives: 1 },
  });
  assert.deepEqual(finished, []);
  assert.deepEqual(dbCalls, [
    'sweepsDue',
    'archiveCleanupsDue',
    'finishArchiveCleanups',
    'claimStale',
    'ackCollected',
    'claimStale',
  ]);
  assert.ok(logs.includes('cleanup_drafts.finish_failed'), 'the skip is logged');
  assert.ok(!logs.includes('cleanup_drafts.db_skipped'), 'no taint');
});

test('IR3-REVIEW-02 finishSweeps skips a locked manifest: partial count at once, no taint, it stays due', async () => {
  // One serialized connection; the three prefixes end at 5,000, 10,000 and
  // 15,000 ms (before the 16,000 work deadline). finish_media_sweeps skips rows other transactions hold (skip locked), so
  // it returns at once with fewer than it was given instead of waiting.
  const db = serialDb();
  let clock = 0;
  const logs: string[] = [];
  const locked = new Set(['d2']);
  const unswept = new Set(['d1', 'd2', 'd3']);
  const { d, finished } = deps([], {
    now: () => clock,
    budgetMs: BUDGET_MS,
    sweepsDue: () =>
      db.run('sweepsDue', async () =>
        [...unswept].map((id) => ({ id, gen: 1, prefixes: [`c/1/u/${id}/`], pos: 0 })),
      ),
    deleteUnder: async (prefix) => {
      clock += 5_000;
      return [`${prefix}a.webp`];
    },
    finishSweeps: (items) =>
      db.run('finishSweeps', async () => {
        finished.push(items);
        const got = items.filter((item) => !locked.has(item.id));
        for (const item of got) unswept.delete(item.id);
        return got.length;
      }),
    archiveCleanupsDue: () =>
      db.run('archiveCleanupsDue', async () => [
        { id: 'C1', token: 't1', key: 'archive/chats/C1/t1.json' },
      ]),
    finishArchiveCleanups: (items) => db.run('finishArchiveCleanups', async () => items.length),
    claimStale: () =>
      db.run('claimStale', async () => (db.calls.includes('ackCollected') ? [] : batchOf('a', 1))),
    ackCollected: (items) => db.run('ackCollected', async () => items.length),
    log: (e) => logs.push(e),
  });
  const started = Date.now();
  const res = await handleCleanupDrafts(post(), d);
  assert.ok(Date.now() - started < 1_000, 'no wait on the locked row');
  assert.equal(res.status, 200);
  assert.equal(res.body.sweeps, 2, 'only the manifests actually finished are counted');
  assert.equal(res.body.archives, 1);
  assert.equal(res.body.collected, 1);
  assert.deepEqual(finished, [
    [
      { id: 'd1', gen: 1 },
      { id: 'd2', gen: 1 },
      { id: 'd3', gen: 1 },
    ],
  ]);
  assert.deepEqual(db.calls, [
    'sweepsDue',
    'finishSweeps',
    'archiveCleanupsDue',
    'finishArchiveCleanups',
    'claimStale',
    'ackCollected',
    'claimStale',
  ]);
  assert.ok(!logs.includes('cleanup_drafts.db_skipped'), 'no taint');
  assert.ok(!logs.includes('cleanup_drafts.db_failed'));
  // Next invocation, the lock released: the skipped manifest is still due and finishes.
  locked.clear();
  clock = 0;
  db.calls.length = 0;
  finished.length = 0;
  const next = await handleCleanupDrafts(post(), d);
  assert.equal(next.status, 200);
  assert.deepEqual(finished, [[{ id: 'd2', gen: 1 }]]);
  assert.equal(next.body.sweeps, 1);
  assert.equal(unswept.size, 0);
});
