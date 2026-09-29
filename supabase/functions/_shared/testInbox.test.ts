// P14-E2E-00 test-inbox guard rails.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allowedEnv, handleTestInbox } from './testInbox.ts';

const SECRET = 'x'.repeat(20); // test value
const deps = (over: Partial<Parameters<typeof handleTestInbox>[1]> = {}) => ({
  appEnv: 'staging',
  supabaseUrl: 'https://abc.supabase.co',
  secret: SECRET,
  generateOtp: async () => '123456',
  ...over,
});
const req = (email: string, secret: string | null = SECRET) => ({
  method: 'POST',
  secretHeader: secret,
  body: { email },
});

test('staging returns a code for an e2e address', async () => {
  assert.deepEqual(await handleTestInbox(req('e2e+01@e2e.onlyswap.test'), deps()), {
    status: 200,
    body: { code: '123456' },
  });
});

test('production never answers, even with the secret', async () => {
  const res = await handleTestInbox(
    req('e2e+01@e2e.onlyswap.test'),
    deps({ appEnv: 'production' }),
  );
  assert.equal(res.status, 404);
  assert.equal(allowedEnv(undefined, 'https://abc.supabase.co'), false);
  assert.equal(allowedEnv(undefined, 'http://kong:8000'), true);
});

test('needs the secret and an e2e address', async () => {
  assert.equal(
    (await handleTestInbox(req('e2e+01@e2e.onlyswap.test', 'wrong'), deps())).status,
    401,
  );
  assert.equal((await handleTestInbox(req('e2e+01@e2e.onlyswap.test', null), deps())).status, 401);
  assert.equal(
    (await handleTestInbox(req('e2e+01@e2e.onlyswap.test'), deps({ secret: 'short' }))).status,
    401,
  );
  assert.equal((await handleTestInbox(req('kim@osu.edu'), deps())).status, 400);
  assert.equal(
    (
      await handleTestInbox(
        req('e2e+01@e2e.onlyswap.test'),
        deps({ generateOtp: async () => null }),
      )
    ).status,
    404,
  );
});
