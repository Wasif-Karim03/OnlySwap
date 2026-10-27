// DEC 152: scan-photos core.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  handleScanPhotos,
  RateLimited,
  readVerdict,
  workerScanner,
  type ScanDeps,
  type ScanRow,
  type Verdict,
} from './photoScan.ts';

const KEY = 'service-key';
const req = { method: 'POST', authorization: `Bearer ${KEY}` };
const rows: ScanRow[] = [
  { id: 1, kind: 'listing', target_id: 'l1', path: 'a.webp' },
  { id: 2, kind: 'quad', target_id: 'q1', path: 'b.webp' },
];

function deps(over: Partial<ScanDeps> = {}) {
  const finished: [number, Verdict][] = [];
  const d: ScanDeps = {
    keys: [KEY],
    configured: true,
    claim: async () => rows,
    finish: async (id, v) => void finished.push([id, v]),
    classify: async (path) =>
      path === 'a.webp' ? { verdict: 'ok' } : { verdict: 'flag', reason: 'sexual' },
    ...over,
  };
  return { d, finished };
}

test('readVerdict accepts ok and flag, anything else is a retry', () => {
  assert.deepEqual(readVerdict({ verdict: 'ok' }), { verdict: 'ok' });
  assert.deepEqual(readVerdict({ verdict: 'flag', reason: 'weapon' }), {
    verdict: 'flag',
    reason: 'weapon',
  });
  assert.deepEqual(readVerdict({ verdict: 'flag', reason: 'weird' }), {
    verdict: 'flag',
    reason: 'other',
  });
  assert.deepEqual(readVerdict({ verdict: 'retry' }), { verdict: 'retry' });
  assert.deepEqual(readVerdict(null), { verdict: 'retry' });
});

test('only the service key may call it', async () => {
  const { d } = deps();
  assert.equal(
    (await handleScanPhotos({ method: 'POST', authorization: 'Bearer nope' }, d)).status,
    401,
  );
  assert.equal(
    (await handleScanPhotos({ method: 'GET', authorization: `Bearer ${KEY}` }, d)).status,
    405,
  );
});

test('without the scan settings nothing is claimed', async () => {
  let claimed = false;
  const { d } = deps({ configured: false, claim: async () => ((claimed = true), rows) });
  const res = await handleScanPhotos(req, d);
  assert.equal(res.body.skipped, 'not_configured');
  assert.equal(claimed, false);
});

test('screens each photo and records the verdict', async () => {
  const { d, finished } = deps();
  const res = await handleScanPhotos(req, d);
  assert.deepEqual(finished, [
    [1, { verdict: 'ok' }],
    [2, { verdict: 'flag', reason: 'sexual' }],
  ]);
  assert.equal(res.body.flagged, 1);
});

test('a rate limit puts the rest back for the next run', async () => {
  const { d, finished } = deps({
    classify: async () => {
      throw new RateLimited('429');
    },
  });
  await handleScanPhotos(req, d);
  assert.deepEqual(
    finished.map(([, v]) => v.verdict),
    ['retry', 'retry'],
  );
});

test('the scanner posts the path to the media Worker with the scan key', async () => {
  let sent: { url: string; init: RequestInit } | null = null;
  const fake = (async (url: string, init: RequestInit) => {
    sent = { url, init };
    return new Response(JSON.stringify({ verdict: 'ok' }));
  }) as unknown as typeof fetch;
  const v = await workerScanner('https://media.example/', 'scan-secret', fake)('c/x/l/a_full.webp');
  assert.deepEqual(v, { verdict: 'ok' });
  assert.equal(sent!.url, 'https://media.example/internal/scan');
  assert.equal((sent!.init.headers as Record<string, string>).authorization, 'Bearer scan-secret');
  assert.deepEqual(JSON.parse(String(sent!.init.body)), { path: 'c/x/l/a_full.webp' });
  const limited = (async () => new Response('', { status: 429 })) as unknown as typeof fetch;
  await assert.rejects(workerScanner('https://m', 'k', limited)('x'), RateLimited);
  const broken = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
  await assert.rejects(workerScanner('https://m', 'k', broken)('x'), /scan worker 503/);
});
