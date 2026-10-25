// DEC 152: scan-photos core.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  handleScanPhotos,
  parseVerdict,
  RateLimited,
  toDataUri,
  workersAiClassifier,
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
    image: async (p) => `data:image/webp;base64,${p}`,
    classify: async (img) =>
      img.endsWith('a.webp') ? '{"verdict":"ok"}' : '{"verdict":"flag","reason":"sexual"}',
    ...over,
  };
  return { d, finished };
}

test('parseVerdict reads ok, flag and anything else as retry', () => {
  assert.deepEqual(parseVerdict('{"verdict":"ok"}'), { verdict: 'ok' });
  assert.deepEqual(parseVerdict('Sure. {"verdict":"flag","reason":"Weapon"}'), {
    verdict: 'flag',
    reason: 'weapon',
  });
  assert.deepEqual(parseVerdict('{"verdict":"flag","reason":"weird"}'), {
    verdict: 'flag',
    reason: 'other',
  });
  assert.deepEqual(parseVerdict('I cannot tell'), { verdict: 'retry' });
  assert.deepEqual(parseVerdict(''), { verdict: 'retry' });
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

test('without Cloudflare settings nothing is claimed', async () => {
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

test('the classifier sends the image and reads result.response', async () => {
  let sent: { url: string; body: Record<string, unknown> } | null = null;
  const fake = (async (url: string, init: RequestInit) => {
    sent = { url, body: JSON.parse(String(init.body)) };
    return new Response(
      JSON.stringify({ result: { response: '{"verdict":"ok"}' }, success: true }),
    );
  }) as unknown as typeof fetch;
  const text = await workersAiClassifier('acct', 'tok', fake)('data:image/webp;base64,AAAA');
  assert.equal(text, '{"verdict":"ok"}');
  assert.match(sent!.url, /accounts\/acct\/ai\/run\/@cf\/meta\/llama-3\.2-11b-vision-instruct$/);
  assert.equal(sent!.body.image, 'data:image/webp;base64,AAAA');
  const limited = (async () => new Response('', { status: 429 })) as unknown as typeof fetch;
  await assert.rejects(workersAiClassifier('a', 't', limited)('x'), RateLimited);
});

test('toDataUri encodes bytes as base64', () => {
  assert.equal(toDataUri(new Uint8Array([104, 105]), 'image/jpeg'), 'data:image/jpeg;base64,aGk=');
});
