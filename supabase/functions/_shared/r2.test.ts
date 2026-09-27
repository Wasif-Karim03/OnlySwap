// R2 client over a fake fetch: list pagination, prefix delete, copy, env.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createR2, r2FromEnv } from './r2.ts';

const cfg = {
  endpoint: 'https://acct.r2.test',
  region: 'auto',
  accessKeyId: 'AK',
  secretAccessKey: 'SK',
  mediaBucket: 'onlyswap-media',
  privateBucket: 'onlyswap-private',
};

function fakeFetch(pages: string[]) {
  const calls: { method: string; url: string; headers: Record<string, string> }[] = [];
  let page = 0;
  const f = async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url, headers: (init?.headers ?? {}) as Record<string, string> });
    if (method === 'GET')
      return new Response(pages[page++] ?? '<ListBucketResult/>', { status: 200 });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    return new Response('<CopyObjectResult/>', { status: 200 });
  };
  return { f, calls };
}

test('list follows continuation tokens and decodes keys', async () => {
  const { f, calls } = fakeFetch([
    '<ListBucketResult><IsTruncated>true</IsTruncated><Contents><Key>c/1/u/9/a&amp;b.webp</Key></Contents><NextContinuationToken>t2</NextContinuationToken></ListBucketResult>',
    '<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>c/1/u/9/c.webp</Key></Contents></ListBucketResult>',
  ]);
  const r2 = createR2(cfg, f);
  assert.deepEqual(await r2.list('onlyswap-media', 'c/1/u/9/'), [
    'c/1/u/9/a&b.webp',
    'c/1/u/9/c.webp',
  ]);
  assert.match(calls[1]?.url ?? '', /continuation-token=t2/);
  assert.match(calls[0]?.headers.authorization ?? '', /^AWS4-HMAC-SHA256 Credential=AK\//);
});

test('deletePrefix removes every listed key', async () => {
  const { f, calls } = fakeFetch([
    '<ListBucketResult><Contents><Key>c/1/l/L/a_full.webp</Key></Contents><Contents><Key>c/1/l/L/a_thumb.webp</Key></Contents></ListBucketResult>',
  ]);
  const r2 = createR2(cfg, f);
  assert.equal(await r2.deletePrefix('onlyswap-media', 'c/1/l/L/'), 2);
  assert.deepEqual(
    calls.filter((c) => c.method === 'DELETE').map((c) => c.url),
    [
      'https://acct.r2.test/onlyswap-media/c/1/l/L/a_full.webp',
      'https://acct.r2.test/onlyswap-media/c/1/l/L/a_thumb.webp',
    ],
  );
});

test('copy sends x-amz-copy-source from the other bucket', async () => {
  const { f, calls } = fakeFetch([]);
  await createR2(cfg, f).copy(
    'onlyswap-media',
    'c/1/l/L/a_full.webp',
    'onlyswap-private',
    'evidence/R/a_full.webp',
  );
  assert.equal(calls[0]?.method, 'PUT');
  assert.equal(calls[0]?.url, 'https://acct.r2.test/onlyswap-private/evidence/R/a_full.webp');
  assert.equal(calls[0]?.headers['x-amz-copy-source'], '/onlyswap-media/c/1/l/L/a_full.webp');
});

test('a failed call throws; deleting a missing key is fine', async () => {
  const r2 = createR2(
    cfg,
    async (_u, init) => new Response(null, { status: init?.method === 'DELETE' ? 404 : 403 }),
  );
  await r2.delete('onlyswap-media', 'gone');
  await assert.rejects(r2.list('onlyswap-media', 'x/'), /r2 GET 403/);
});

test('env: defaults and missing values', () => {
  const env = new Map([
    ['R2_ENDPOINT', 'https://acct.r2.test/'],
    ['R2_ACCESS_KEY_ID', 'AK'],
    ['R2_SECRET_ACCESS_KEY', 'SK'],
  ]);
  const c = r2FromEnv(env);
  assert.equal(c.endpoint, 'https://acct.r2.test');
  assert.equal(c.region, 'auto');
  assert.equal(c.mediaBucket, 'onlyswap-media');
  assert.throws(() => r2FromEnv(new Map()), /missing R2_ENDPOINT/);
});

test('copy of a missing source returns false instead of throwing', async () => {
  const r2 = createR2(
    cfg,
    async () => new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 }),
  );
  assert.equal(
    await r2.copy('onlyswap-media', 'gone.webp', 'onlyswap-private', 'evidence/R/gone.webp'),
    false,
  );
});
