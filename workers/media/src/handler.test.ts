// P5-MEDIA-01: public key → 200 + immutable; unknown prefix → 404.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import {
  CACHE_CONTROL,
  handle,
  publicKey,
  RATE_LIMIT,
  resetRateLimit,
  signChat,
  type Env,
} from './handler.ts';

const objects = new Map<string, string>([
  ['c/osu/l/L1/abc_full.webp', 'WEBPDATA'],
  ['share/L1.jpg', 'JPEGDATA'],
  ['c/osu/chat/C1/x.webp', 'PRIVATE'],
]);
const env: Env = {
  MEDIA: {
    get: async (key) => {
      const v = objects.get(key);
      return v === undefined ? null : { body: v, size: v.length, httpEtag: `"${key.length}"` };
    },
  },
};
const get = (path: string, init: RequestInit = {}) =>
  handle(new Request(`https://media.onlyswap.test${path}`, init), env);

beforeEach(() => resetRateLimit());

test('a public key is served with immutable caching, nosniff and its type', async () => {
  const res = await get('/c/osu/l/L1/abc_full.webp');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), CACHE_CONTROL);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('content-type'), 'image/webp');
  assert.equal(await res.text(), 'WEBPDATA');
  const share = await get('/share/L1.jpg');
  assert.equal(share.headers.get('content-type'), 'image/jpeg');
});

test('unknown prefixes, private areas, traversal and odd types are 404', async () => {
  for (const path of [
    '/exports/u/1.json',
    '/evidence/R/a.webp',
    '/c/osu/chat/C1/x.webp',
    '/c/osu/l/../../evidence/a.webp',
    '/c/osu/l/L1/abc_full.svg',
    '/',
    '/c//l/x.webp',
    '/%E0%A4%A.webp',
  ]) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  }
});

test('a missing object is 404', async () => {
  assert.equal((await get('/c/osu/l/L1/missing_full.webp')).status, 404);
});

test('HEAD has no body; conditional GET is 304; writes are 405', async () => {
  const head = await get('/share/L1.jpg', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const etag = head.headers.get('etag') as string;
  assert.equal((await get('/share/L1.jpg', { headers: { 'if-none-match': etag } })).status, 304);
  assert.equal((await get('/share/L1.jpg', { method: 'PUT', body: 'x' })).status, 405);
  assert.equal((await get('/share/L1.jpg', { method: 'DELETE' })).status, 405);
});

test('best-effort per-IP limit', async () => {
  const init = { headers: { 'cf-connecting-ip': '198.51.100.7' } };
  const t0 = 1_000_000;
  for (let i = 0; i < RATE_LIMIT.max; i++) {
    const res = await handle(new Request('https://m.test/share/L1.jpg', init), env, t0);
    assert.equal(res.status, 200);
  }
  const limited = await handle(new Request('https://m.test/share/L1.jpg', init), env, t0);
  assert.equal(limited.status, 429);
  const other = await handle(
    new Request('https://m.test/share/L1.jpg', { headers: { 'cf-connecting-ip': '198.51.100.8' } }),
    env,
    t0,
  );
  assert.equal(other.status, 200);
  const later = await handle(
    new Request('https://m.test/share/L1.jpg', init),
    env,
    t0 + RATE_LIMIT.windowMs,
  );
  assert.equal(later.status, 200);
});

test('publicKey', () => {
  assert.equal(publicKey('/c/osu/u/U/avatar_x.webp'), 'c/osu/u/U/avatar_x.webp');
  assert.equal(publicKey('/c/osu/quad/P/x_full.webp'), 'c/osu/quad/P/x_full.webp');
  assert.equal(publicKey('/c/osu/chat/C/x_full.webp'), null);
  assert.equal(publicKey('/share/L.JPG'), 'share/L.JPG');
});

test('chat photos: only with a valid, unexpired signature (P8-CHAT-04)', async () => {
  const key = 'c/osu/chat/C1/33333333-3333-4333-8333-333333333333_full.webp';
  const signed: Env = {
    MEDIA_SIGNING_KEY: 'test-media-key',
    MEDIA: {
      get: async (k) => (k === key ? { body: 'CHATPHOTO', size: 9, httpEtag: '"c"' } : null),
    },
  };
  const now = Date.UTC(2027, 2, 10, 17, 0, 0);
  const exp = Math.floor(now / 1000) + 3600;
  const sig = await signChat('test-media-key', key, exp);
  const at = (q: string) => handle(new Request(`https://m.test/${key}${q}`), signed, now);

  const ok = await at(`?exp=${exp}&sig=${sig}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'private, max-age=3600');
  assert.equal((await at('')).status, 404);
  assert.equal((await at(`?exp=${exp}&sig=${'0'.repeat(64)}`)).status, 404);
  assert.equal((await at(`?exp=${exp + 1}&sig=${sig}`)).status, 404);
  const old = Math.floor(now / 1000) - 1;
  assert.equal(
    (await at(`?exp=${old}&sig=${await signChat('test-media-key', key, old)}`)).status,
    404,
  );
  // No key configured: never served.
  assert.equal(
    (
      await handle(
        new Request(`https://m.test/${key}?exp=${exp}&sig=${sig}`),
        { MEDIA: signed.MEDIA },
        now,
      )
    ).status,
    404,
  );
});
