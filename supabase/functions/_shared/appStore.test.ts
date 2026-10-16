// T-FN-APPSTORE app-store-notifications (AR-04): Apple JWS chain checks and
// RESCIND_CONSENT handling. Fixtures use a throwaway test chain.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FIXTURES } from './appStore.fixtures.ts';
import {
  APPLE_ROOT_CA_G3_SHA256,
  appleJwsVerifier,
  handleAppStoreNotification,
  type AppStoreDeps,
} from './appStore.ts';

const verify = appleJwsVerifier([FIXTURES.rootFingerprint]);

function deps(over: Partial<AppStoreDeps> = {}) {
  const rescinded: string[] = [];
  const logs: Record<string, unknown>[] = [];
  const d: AppStoreDeps = {
    verify,
    bundleId: 'app.onlyswap',
    rescind: async (id) => {
      rescinded.push(id);
      return 1;
    },
    log: (e) => logs.push(e),
    ...over,
  };
  return { d, rescinded, logs };
}

const post = (signedPayload: unknown) => ({ method: 'POST', body: { signedPayload } });

test('the pinned production root is Apple Root CA - G3', () => {
  assert.equal(
    APPLE_ROOT_CA_G3_SHA256,
    '63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179',
  );
});

test('a valid chain decodes the payload', async () => {
  const p = await verify(FIXTURES.rescind);
  assert.equal(p.notificationType, 'RESCIND_CONSENT');
});

for (const [name, jws, reason] of [
  ['an edited payload', FIXTURES.tampered, /signature/],
  ['an unknown root', FIXTURES.evilRoot, /root/],
  ['a leaf without the App Store OID', FIXTURES.noOid, /leaf oid/],
  ['a signature from a key that is not the leaf', FIXTURES.wrongSigner, /signature/],
  ['a chain of two', FIXTURES.shortChain, /x5c/],
  ['a signedDate after the certificates expire', FIXTURES.future, /expired/],
  ['not a JWS', 'abc', /shape/],
] as const) {
  test(`rejects ${name}`, async () => {
    await assert.rejects(verify(jws), reason);
  });
}

test('the real Apple root does not accept the test chain', async () => {
  await assert.rejects(appleJwsVerifier()(FIXTURES.rescind), /root/);
});

test('RESCIND_CONSENT locks the accounts linked to the appTransactionId', async () => {
  const { d, rescinded, logs } = deps();
  const res = await handleAppStoreNotification(post(FIXTURES.rescind), d);
  assert.deepEqual(res, { status: 200, body: { ok: true } });
  assert.deepEqual(rescinded, ['704289572311552426']);
  assert.equal(logs.at(-1)?.event, 'appstore_rescind_consent');
  assert.equal(logs.at(-1)?.locked, 1);
});

test('TEST and other types are acknowledged and do nothing', async () => {
  for (const jws of [FIXTURES.test, FIXTURES.refund]) {
    const { d, rescinded, logs } = deps();
    const res = await handleAppStoreNotification(post(jws), d);
    assert.equal(res.status, 200);
    assert.deepEqual(rescinded, []);
    assert.equal(logs.at(-1)?.event, 'appstore_ignored');
  }
});

test('a bad signature is a 400 and locks nobody', async () => {
  for (const jws of [FIXTURES.tampered, FIXTURES.evilRoot, FIXTURES.innerTampered]) {
    const { d, rescinded } = deps();
    const res = await handleAppStoreNotification(post(jws), d);
    assert.deepEqual(res, { status: 400, body: { error: 'SIGNATURE' } });
    assert.deepEqual(rescinded, []);
  }
});

test('another app, outside or inside, is refused', async () => {
  for (const jws of [FIXTURES.wrongBundle, FIXTURES.innerWrongBundle]) {
    const { d, rescinded } = deps();
    const res = await handleAppStoreNotification(post(jws), d);
    assert.deepEqual(res, { status: 400, body: { error: 'BUNDLE' } });
    assert.deepEqual(rescinded, []);
  }
});

test('RESCIND_CONSENT without appData is refused', async () => {
  const { d, rescinded } = deps();
  const res = await handleAppStoreNotification(post(FIXTURES.noAppData), d);
  assert.equal(res.status, 400);
  assert.deepEqual(rescinded, []);
});

test('bad requests', async () => {
  const { d } = deps();
  assert.equal((await handleAppStoreNotification({ method: 'GET', body: null }, d)).status, 405);
  assert.equal((await handleAppStoreNotification({ method: 'POST', body: null }, d)).status, 400);
  assert.equal((await handleAppStoreNotification(post(42), d)).status, 400);
});

test('a database error surfaces so Apple retries', async () => {
  const { d } = deps({
    rescind: async () => {
      throw new Error('db down');
    },
  });
  await assert.rejects(handleAppStoreNotification(post(FIXTURES.rescind), d), /db down/);
});
