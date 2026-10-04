// T-FN-04 upload-url: size and type validation, key format, owner check.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleUploadUrl, LIMITS, objectKey, type UploadDeps } from './uploadUrl.ts';

const LISTING = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const CAMPUS = '33333333-3333-4333-8333-333333333333';

function deps(over: Partial<UploadDeps> = {}) {
  const calls: string[] = [];
  let n = 0;
  const d: UploadDeps = {
    userIdFromToken: async (t) => (t === 'good' ? USER : null),
    authorize: async (u, kind, target) => {
      calls.push(`authorize:${u}:${kind}:${target}`);
      return CAMPUS;
    },
    presignPut: async (key, type, size) => `https://r2.test/${key}?type=${type}&size=${size}`,
    uuid: () => `uuid${++n}`,
    ...over,
  };
  return { d, calls };
}

const req = (body: unknown, auth: string | null = 'Bearer good', method = 'POST') => ({
  method,
  authorization: auth,
  body,
});

const photo = (idx: number, variant: 'full' | 'thumb', size = 1000) => ({
  idx,
  variant,
  type: 'image/webp',
  size,
});

test('listing photos: one uuid per photo, full and thumb keys, signed size and type', async () => {
  const { d, calls } = deps();
  const res = await handleUploadUrl(
    req({
      kind: 'listing',
      target_id: LISTING,
      files: [photo(0, 'full'), photo(0, 'thumb', 50), photo(1, 'full')],
    }),
    d,
  );
  assert.equal(res.status, 200);
  const uploads = res.body.uploads as {
    key: string;
    url: string;
    headers: Record<string, string>;
  }[];
  assert.deepEqual(
    uploads.map((u) => u.key),
    [
      `c/${CAMPUS}/l/${LISTING}/uuid1_full.webp`,
      `c/${CAMPUS}/l/${LISTING}/uuid1_thumb.webp`,
      `c/${CAMPUS}/l/${LISTING}/uuid2_full.webp`,
    ],
  );
  assert.deepEqual(uploads[1]?.headers, { 'content-type': 'image/webp', 'content-length': '50' });
  assert.match(uploads[0]?.url ?? '', /size=1000$/);
  assert.deepEqual(calls, [`authorize:${USER}:listing:${LISTING}`]);
});

test('avatar and share keys', () => {
  assert.equal(objectKey('avatar', 'c', 'u', 'u', 'full', 'x'), 'c/c/u/u/avatar_x.webp');
  assert.equal(objectKey('share', 'c', 'u', 'L', 'full', 'x'), 'share/L.jpg');
  assert.equal(objectKey('quad', 'c', 'u', 'P', 'thumb', 'x'), 'c/c/quad/P/x_thumb.webp');
});

test('sizes and types follow DATA_MODEL §6', async () => {
  const { d } = deps();
  const cases: [unknown, string][] = [
    [
      {
        kind: 'listing',
        target_id: LISTING,
        files: [photo(0, 'full', LIMITS.listing.full!.max + 1)],
      },
      'INVALID:size',
    ],
    [
      { kind: 'listing', target_id: LISTING, files: [photo(0, 'thumb', 200 * 1024 + 1)] },
      'INVALID:size',
    ],
    [
      { kind: 'listing', target_id: LISTING, files: [{ ...photo(0, 'full'), type: 'image/png' }] },
      'INVALID:type',
    ],
    [{ kind: 'listing', target_id: LISTING, files: [photo(8, 'full')] }, 'INVALID:idx'],
    [
      { kind: 'listing', target_id: LISTING, files: [photo(0, 'full'), photo(0, 'full')] },
      'INVALID:files',
    ],
    [{ kind: 'listing', target_id: LISTING, files: [] }, 'INVALID:files'],
    [
      {
        kind: 'listing',
        target_id: LISTING,
        files: Array.from({ length: 17 }, (_, i) => photo(i % 8, i % 2 ? 'thumb' : 'full')),
      },
      'INVALID:files',
    ],
    [{ kind: 'avatar', target_id: USER, files: [photo(0, 'thumb')] }, 'INVALID:variant'],
    [
      { kind: 'avatar', target_id: USER, files: [photo(0, 'full', 300 * 1024 + 1)] },
      'INVALID:size',
    ],
    [{ kind: 'share', target_id: LISTING, files: [photo(0, 'full')] }, 'INVALID:type'],
    [{ kind: 'chat', target_id: LISTING, files: [photo(0, 'full')] }, 'INVALID:kind'],
    [{ kind: 'listing', target_id: '../x', files: [photo(0, 'full')] }, 'INVALID:target_id'],
    [{ kind: 'listing', target_id: LISTING, files: [photo(0, 'full', 0)] }, 'INVALID:size'],
  ];
  for (const [body, error] of cases) {
    const res = await handleUploadUrl(req(body), d);
    assert.deepEqual(res, { status: 400, body: { error } }, JSON.stringify(body));
  }
});

test('not the owner is 403; rate limited is 429; nothing is signed', async () => {
  for (const [message, status] of [
    ['FORBIDDEN', 403],
    ['RATE_LIMITED:upload:2026-09-27T00:00:00Z', 429],
    ['NOT_ACTIVE:paused', 403],
  ] as const) {
    let signed = 0;
    const { d } = deps({
      authorize: async () => {
        throw { message };
      },
      presignPut: async () => {
        signed += 1;
        return 'x';
      },
    });
    const res = await handleUploadUrl(
      req({ kind: 'listing', target_id: LISTING, files: [photo(0, 'full')] }),
      d,
    );
    assert.deepEqual(res, { status, body: { error: message } });
    assert.equal(signed, 0);
  }
});

test('auth and method', async () => {
  const { d } = deps();
  const body = { kind: 'listing', target_id: LISTING, files: [photo(0, 'full')] };
  assert.equal((await handleUploadUrl(req(body, null), d)).status, 401);
  assert.equal((await handleUploadUrl(req(body, 'Bearer bad'), d)).status, 401);
  assert.equal((await handleUploadUrl(req(body, 'Bearer good', 'GET'), d)).status, 405);
});

test('an unexpected failure is a plain 500', async () => {
  const { d } = deps({
    authorize: async () => {
      throw new Error('db down at 10.0.0.1');
    },
  });
  const res = await handleUploadUrl(
    req({ kind: 'listing', target_id: LISTING, files: [photo(0, 'full')] }),
    d,
  );
  assert.deepEqual(res, { status: 500, body: { error: 'UNKNOWN' } });
});
