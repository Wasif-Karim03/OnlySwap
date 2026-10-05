// P11-ACC-02 export-data (node --experimental-strip-types --test). No network:
// every dependency is a fake, and R2 runs over a fake fetch.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EXPORT_LINK_SECONDS,
  handleExportData,
  withMediaUrls,
  type ExportDeps,
} from './exportData.ts';
import { createR2 } from './r2.ts';

function deps(over: Partial<ExportDeps> = {}) {
  const calls: string[] = [];
  const store = new Map<string, string>();
  const d: ExportDeps = {
    userIdFromToken: async (t) => (t === 'good' ? 'u1' : null),
    start: async (u) => {
      calls.push(`start:${u}`);
      return { id: 'e1', key: `exports/${u}/e1.json`, expires_at: '2027-03-17T12:00:00Z' };
    },
    collect: async (u) => {
      calls.push(`collect:${u}`);
      return {
        account: { id: u, email: 'a@osu.edu' },
        profile: { first_name: 'Aisha', avatar_path: 'c/x/u/u1/avatar.webp' },
        listings: [
          {
            id: 'L1',
            photos: [{ idx: 0, path: 'c/x/l/L1/0.webp', thumb_path: 'c/x/l/L1/0_t.webp' }],
          },
        ],
        quad: {
          posts: [
            { id: 'q1', photo_path: 'c/x/q/q1/0.webp' },
            { id: 'q2', photo_path: null },
          ],
        },
      };
    },
    upload: async (k, body) => {
      calls.push(`upload:${k}`);
      store.set(k, body);
    },
    presignGet: async (k, s) => {
      calls.push(`presign:${s}`);
      return `https://r2.test/onlyswap-private/${k}?sig=x`;
    },
    finish: async (id, url) => void calls.push(`finish:${id}:${url}`),
    fail: async (id) => void calls.push(`fail:${id}`),
    mediaUrl: 'https://media.test/',
    ...over,
  };
  return { d, calls, store };
}

const req = (auth: string | null = 'Bearer good', method = 'POST') => ({
  method,
  authorization: auth,
});

test('T-INT-EXPORT-01 builds, uploads to the caller folder, links for 7 days, then finishes', async () => {
  const { d, calls, store } = deps();
  const res = await handleExportData(req(), d);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'queued', expires_at: '2027-03-17T12:00:00Z' });
  assert.deepEqual(calls, [
    'start:u1',
    'collect:u1',
    'upload:exports/u1/e1.json',
    `presign:${EXPORT_LINK_SECONDS}`,
    'finish:e1:https://r2.test/onlyswap-private/exports/u1/e1.json?sig=x',
  ]);
  assert.equal(EXPORT_LINK_SECONDS, 604800);
  const json = JSON.parse(store.get('exports/u1/e1.json') ?? '{}');
  assert.equal(json.account.email, 'a@osu.edu');
  assert.equal(json.listings[0].photos[0].url, 'https://media.test/c/x/l/L1/0.webp');
});

test('rejects other methods and missing or bad tokens before touching the database', async () => {
  const { d, calls } = deps();
  assert.equal((await handleExportData(req('Bearer good', 'GET'), d)).status, 405);
  assert.deepEqual((await handleExportData(req(null), d)).body, { error: 'NOT_AUTHENTICATED' });
  assert.equal((await handleExportData(req('Bearer nope'), d)).status, 401);
  assert.deepEqual(calls, []);
});

test('the daily limit comes back as 429 with the retry time', async () => {
  const { d, calls } = deps({
    start: async () => {
      throw new Error('RATE_LIMITED:export_data:2027-03-11T17:00:00Z');
    },
  });
  const res = await handleExportData(req(), d);
  assert.equal(res.status, 429);
  assert.deepEqual(res.body, { error: 'RATE_LIMITED:export_data:2027-03-11T17:00:00Z' });
  assert.deepEqual(calls, []);
});

test('a failed upload marks the export failed and sends no email', async () => {
  const logs: unknown[] = [];
  const { d, calls } = deps({
    upload: async () => {
      throw new Error('r2 PUT 403');
    },
    log: (e, data) => logs.push({ e, ...data }),
  });
  const res = await handleExportData(req(), d);
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: 'UNKNOWN' });
  assert.ok(calls.includes('fail:e1'));
  assert.ok(!calls.some((c) => c.startsWith('finish:')));
  assert.deepEqual(logs, [{ e: 'export_data.failed', detail: 'r2 PUT 403' }]);
});

test('a key outside the caller folder is refused', async () => {
  const { d, calls } = deps({
    start: async () => ({ id: 'e9', key: 'exports/someone-else/e9.json' }),
  });
  const res = await handleExportData(req(), d);
  assert.equal(res.status, 500);
  assert.deepEqual(calls, ['fail:e9']);
});

test('unexpected start errors are a plain 500', async () => {
  const { d } = deps({
    start: async () => {
      throw new Error('connection reset');
    },
  });
  assert.deepEqual((await handleExportData(req(), d)).body, { error: 'UNKNOWN' });
});

test('withMediaUrls links public photos only and leaves data alone without a base', () => {
  const data = {
    profile: { avatar_path: 'c/x/u/u1/a.webp' },
    listings: [{ photos: [{ path: 'c/x/l/L1/0.webp', thumb_path: 'c/x/l/L1/0_t.webp' }] }],
    quad: { posts: [{ photo_path: 'c/x/q/1.webp' }, { photo_path: null }] },
    chats: [{ messages: [{ photo_path: 'c/x/ch/1/p.webp' }] }],
  };
  const out = withMediaUrls(data, 'https://media.test') as typeof data & Record<string, never>;
  assert.equal(
    (out.profile as Record<string, unknown>).avatar_url,
    'https://media.test/c/x/u/u1/a.webp',
  );
  assert.equal(
    (out.listings[0]?.photos[0] as Record<string, unknown>).thumb_url,
    'https://media.test/c/x/l/L1/0_t.webp',
  );
  assert.equal(
    (out.quad.posts[0] as Record<string, unknown>).photo_url,
    'https://media.test/c/x/q/1.webp',
  );
  assert.equal((out.quad.posts[1] as Record<string, unknown>).photo_url, undefined);
  assert.deepEqual(out.chats, data.chats, 'chat photos stay as paths');
  assert.equal(withMediaUrls(data, null), data);
  assert.equal(withMediaUrls(data, ''), data);
});

test('r2.presignGet signs a GET on the private bucket for the requested lifetime', async () => {
  const r2 = createR2(
    {
      endpoint: 'https://acct.r2.test',
      region: 'auto',
      accessKeyId: 'AK',
      secretAccessKey: 'SK',
      mediaBucket: 'onlyswap-media',
      privateBucket: 'onlyswap-private',
    },
    async () => {
      throw new Error('no network in tests');
    },
  );
  const url = new URL(
    await r2.presignGet('onlyswap-private', 'exports/u1/e1.json', EXPORT_LINK_SECONDS),
  );
  assert.equal(
    url.origin + url.pathname,
    'https://acct.r2.test/onlyswap-private/exports/u1/e1.json',
  );
  assert.equal(url.searchParams.get('X-Amz-Expires'), '604800');
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host');
  assert.match(url.searchParams.get('X-Amz-Signature') ?? '', /^[0-9a-f]{64}$/);
});
