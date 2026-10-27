// R2 client over a fake fetch: list pagination, prefix delete, copy, env.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createR2, deletedBeforeFailure, R2PartialDeleteError, r2FromEnv } from './r2.ts';

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

test('deleteUnder returns the keys it removed (LR-02 purge targets)', async () => {
  const { f, calls } = fakeFetch([
    '<ListBucketResult><Contents><Key>c/1/quad/Q/a_full.webp</Key></Contents><Contents><Key>c/1/quad/Q/a_thumb.webp</Key></Contents></ListBucketResult>',
  ]);
  const r2 = createR2(cfg, f);
  assert.deepEqual(await r2.deleteUnder('onlyswap-media', 'c/1/quad/Q/'), [
    'c/1/quad/Q/a_full.webp',
    'c/1/quad/Q/a_thumb.webp',
  ]);
  assert.equal(calls.filter((c) => c.method === 'DELETE').length, 2);
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

test('IR-05 deleteUnder failing part way throws with the keys already deleted', async () => {
  const list =
    '<ListBucketResult><Contents><Key>c/1/u/9/a_full.webp</Key></Contents><Contents><Key>c/1/u/9/b_full.webp</Key></Contents></ListBucketResult>';
  const r2 = createR2(cfg, async (url, init) => {
    if ((init?.method ?? 'GET') === 'GET') return new Response(list, { status: 200 });
    return new Response(null, { status: url.endsWith('b_full.webp') ? 500 : 204 });
  });
  const error = await r2.deleteUnder('onlyswap-media', 'c/1/u/9/').then(
    () => assert.fail('expected a throw'),
    (e: unknown) => e,
  );
  assert.ok(error instanceof R2PartialDeleteError);
  // Method and status only in the message (no keys in logs).
  assert.equal((error as Error).message, 'r2 DELETE 500');
  assert.deepEqual(deletedBeforeFailure(error), ['c/1/u/9/a_full.webp']);
  assert.deepEqual(deletedBeforeFailure(new Error('r2 GET 500')), []);
});

test('IR-02 exists is a HEAD: true when found, false on 404, throws otherwise', async () => {
  const methods: string[] = [];
  const r2 = createR2(cfg, async (url, init) => {
    methods.push(init?.method ?? 'GET');
    if (url.endsWith('/here.webp')) return new Response(null, { status: 200 });
    if (url.endsWith('/gone.webp')) return new Response(null, { status: 404 });
    return new Response(null, { status: 403 });
  });
  assert.equal(await r2.exists('onlyswap-private', 'evidence/R1/here.webp'), true);
  assert.equal(await r2.exists('onlyswap-private', 'evidence/R1/gone.webp'), false);
  await assert.rejects(r2.exists('onlyswap-private', 'evidence/R1/x.webp'), /r2 HEAD 403/);
  assert.deepEqual(methods, ['HEAD', 'HEAD', 'HEAD']);
});

test('RV-02 deleteUnder stops between objects when asked, with the keys deleted so far', async () => {
  const list =
    '<ListBucketResult><Contents><Key>c/1/u/9/a_full.webp</Key></Contents><Contents><Key>c/1/u/9/b_full.webp</Key></Contents><Contents><Key>c/1/u/9/c_full.webp</Key></Contents></ListBucketResult>';
  const methods: string[] = [];
  const r2 = createR2(cfg, async (_url, init) => {
    methods.push(init?.method ?? 'GET');
    if ((init?.method ?? 'GET') === 'GET') return new Response(list, { status: 200 });
    return new Response(null, { status: 204 });
  });
  const error = await r2
    .deleteUnder('onlyswap-media', 'c/1/u/9/', { stop: () => methods.includes('DELETE') })
    .then(
      () => assert.fail('expected a stop'),
      (e: unknown) => e,
    );
  assert.ok(error instanceof R2PartialDeleteError);
  assert.equal((error as R2PartialDeleteError).stopped, true);
  assert.deepEqual(deletedBeforeFailure(error), ['c/1/u/9/a_full.webp']);
  assert.deepEqual(methods, ['GET', 'DELETE']);
});

test('RV-02 deleteUnder passes its signal to every request and stops before listing once fired', async () => {
  const signals: (AbortSignal | null | undefined)[] = [];
  const r2 = createR2(cfg, async (_url, init) => {
    signals.push(init?.signal);
    if ((init?.method ?? 'GET') === 'GET')
      return new Response(
        '<ListBucketResult><Contents><Key>k/a</Key></Contents></ListBucketResult>',
        {
          status: 200,
        },
      );
    return new Response(null, { status: 204 });
  });
  const ac = new AbortController();
  assert.deepEqual(await r2.deleteUnder('onlyswap-media', 'k/', { signal: ac.signal }), ['k/a']);
  assert.deepEqual(signals, [ac.signal, ac.signal]);
  ac.abort();
  const error = await r2.deleteUnder('onlyswap-media', 'k/', { signal: ac.signal }).then(
    () => assert.fail('expected a stop'),
    (e: unknown) => e,
  );
  assert.equal((error as R2PartialDeleteError).stopped, true);
  assert.equal(signals.length, 2, 'no request after the signal fired');
});

test('IR3-02 deleteUnder deletes each page before listing the next; a stop on page 2 keeps page 1', async () => {
  const pages = [
    '<ListBucketResult><IsTruncated>true</IsTruncated><Contents><Key>k/a</Key></Contents><Contents><Key>k/b</Key></Contents><NextContinuationToken>t2</NextContinuationToken></ListBucketResult>',
    '<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>k/c</Key></Contents><Contents><Key>k/d</Key></Contents></ListBucketResult>',
  ];
  const { f, calls } = fakeFetch(pages);
  const r2 = createR2(cfg, f);
  assert.deepEqual(await r2.deleteUnder('onlyswap-media', 'k/'), ['k/a', 'k/b', 'k/c', 'k/d']);
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.url.replace(/^.*onlyswap-media/, '')}`),
    [
      'GET ?list-type=2&prefix=k%2F',
      'DELETE /k/a',
      'DELETE /k/b',
      'GET ?list-type=2&prefix=k%2F&continuation-token=t2',
      'DELETE /k/c',
      'DELETE /k/d',
    ],
  );

  // Stop once page 2 is listed (before its first delete).
  const second = fakeFetch(pages);
  const stopping = createR2(cfg, second.f);
  const error = await stopping
    .deleteUnder('onlyswap-media', 'k/', {
      stop: () => second.calls.filter((c) => c.method === 'GET').length === 2,
    })
    .then(
      () => assert.fail('expected a stop'),
      (e: unknown) => e,
    );
  assert.ok(error instanceof R2PartialDeleteError);
  assert.equal((error as R2PartialDeleteError).stopped, true);
  assert.deepEqual(deletedBeforeFailure(error), ['k/a', 'k/b']);
  assert.deepEqual(
    second.calls.map((c) => c.method),
    ['GET', 'DELETE', 'DELETE', 'GET'],
  );
});
