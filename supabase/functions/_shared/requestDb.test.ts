// IR3-R6: cleanup-drafts opens its single-connection pool per request and
// closes it with end({ timeout: 0 }) when the request ends, so a query left
// hanging by one request never blocks the next.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleCleanupDrafts, MIN_CALL_MS, type CleanupDeps } from './cleanupDrafts.ts';
import { createRequestDb } from './requestDb.ts';

const KEY = 'service-key-123';

/** A fake max: 1 pool: queries run one at a time; `hang` ones never settle. */
function fakePool(hang: boolean) {
  const ends: { timeout: number }[] = [];
  let tail: Promise<unknown> = Promise.resolve();
  const query = <T>(value: T): Promise<T> => {
    const result = tail.then(() => (hang ? new Promise<T>(() => {}) : value));
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  return {
    query,
    ends,
    end: async (options: { timeout: number }) => {
      ends.push(options);
    },
  };
}

type Pool = ReturnType<typeof fakePool>;

function depsFor(pool: Pool, swept: string[]): CleanupDeps {
  return {
    keys: [KEY],
    // Real clock: the sweep fetch may wait until 160 ms (0.4 × 400). The
    // budget is far below DB_MIN_CALL_MS, so database calls need only MIN_CALL_MS.
    budgetMs: 400,
    dbMinMs: MIN_CALL_MS,
    claimStale: () => pool.query([]),
    deleteKey: async () => {},
    ackCollected: (items) => pool.query(items.length),
    sweepsDue: () => pool.query([{ id: 'd1', gen: 1, prefixes: ['c/1/l/L1/'], pos: 0 }]),
    deleteUnder: async (prefix) => {
      swept.push(prefix);
      return [];
    },
    saveSweepProgress: () => pool.query(1),
    finishSweeps: (items) => pool.query(items.length),
    archiveCleanupsDue: () => pool.query([]),
    deletePrivate: async () => {},
    finishArchiveCleanups: (items) => pool.query(items.length),
  };
}

test('IR3-R6 a request after a hung query gets a fresh pool; the hung one is closed at once', async () => {
  const pools: Pool[] = [];
  const withDb = createRequestDb(() => {
    // The first request's connection hangs on its first query.
    const pool = fakePool(pools.length === 0);
    pools.push(pool);
    return pool;
  });
  const swept: string[] = [];
  const post = { method: 'POST', authorization: `Bearer ${KEY}` };

  const first = await withDb((pool) => handleCleanupDrafts(post, depsFor(pool, swept)));
  assert.equal(first.status, 500, 'the hung sweep fetch timed out');
  assert.deepEqual(pools[0]?.ends, [{ timeout: 0 }]);

  const second = await withDb((pool) => handleCleanupDrafts(post, depsFor(pool, swept)));
  assert.equal(pools.length, 2, 'the factory is called per request');
  assert.equal(second.status, 200);
  assert.equal(second.body.sweeps, 1, 'its sweepsDue resolved');
  assert.deepEqual(swept, ['c/1/l/L1/']);
  assert.deepEqual(pools[1]?.ends, [{ timeout: 0 }]);
});

test('the pool is closed even when the request throws', async () => {
  const ends: { timeout: number }[] = [];
  const withDb = createRequestDb(() => ({
    end: async (options: { timeout: number }) => {
      ends.push(options);
    },
  }));
  await assert.rejects(
    withDb(async () => {
      throw new Error('boom');
    }),
    /boom/,
  );
  assert.deepEqual(ends, [{ timeout: 0 }]);
});
