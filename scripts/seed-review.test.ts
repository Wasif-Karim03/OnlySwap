// P4-AUTH-15: seed-review is idempotent and never logs the password.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readEnv, REVIEWERS, seedReview } from './seed-review.ts';

function fakeProject(existing: string[] = []) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const users = existing.map((email, i) => ({ id: `u${i}`, email }));
  const f = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const path = url.replace('http://db.test', '');
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    if (path.startsWith('/auth/v1/admin/users') && method === 'POST') {
      if (users.some((u) => u.email === body.email)) return new Response('{}', { status: 422 });
      const u = { id: `new-${body.email}`, email: body.email };
      users.push(u);
      return new Response(JSON.stringify(u), { status: 200 });
    }
    if (path.startsWith('/auth/v1/admin/users?'))
      return new Response(JSON.stringify({ users }), { status: 200 });
    if (path.startsWith('/auth/v1/admin/users/')) return new Response('{}', { status: 200 });
    if (path.startsWith('/rest/v1/app_config'))
      return new Response('[{"value":"3"}]', { status: 200 });
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  return { f, calls };
}

const env = { url: 'http://db.test', serviceKey: 'svc', password: 'correct-horse-battery' };

test('creates the demo campus, review_accounts and onboarded reviewers', async () => {
  const { f, calls } = fakeProject();
  const lines: string[] = [];
  await seedReview(env, f, (l) => lines.push(l));
  const paths = calls.map((c) => `${c.method} ${c.path.split('?')[0]}`);
  assert.ok(paths.includes('POST /rest/v1/campuses'));
  assert.ok(paths.includes('POST /rest/v1/campus_domains'));
  assert.ok(paths.includes('POST /rest/v1/review_accounts'));
  const created = calls.filter((c) => c.method === 'POST' && c.path === '/auth/v1/admin/users');
  assert.equal(created.length, REVIEWERS.length);
  assert.deepEqual((created[0]?.body as { email_confirm: boolean }).email_confirm, true);
  const patches = calls.filter((c) => c.method === 'PATCH');
  assert.equal(patches.length, REVIEWERS.length);
  assert.equal((patches[0]?.body as { rules_version: string }).rules_version, '3');
  assert.ok(
    lines.every((l) => !l.includes(env.password)),
    'the password is never printed',
  );
});

test('running it again updates the existing users instead of failing', async () => {
  const { f, calls } = fakeProject(REVIEWERS.map((r) => r.email));
  await seedReview(env, f, () => {});
  assert.equal(calls.filter((c) => c.method === 'PUT').length, REVIEWERS.length);
});

test('env: url, key and a long enough password are required', () => {
  assert.throws(() => readEnv({}), /SUPABASE_URL/);
  assert.throws(() => readEnv({ SUPABASE_URL: 'https://x.supabase.co' }), /SERVICE_KEY/);
  assert.throws(
    () =>
      readEnv({
        SUPABASE_URL: 'https://x.supabase.co',
        SERVICE_KEY: 'k',
        REVIEW_PASSWORD: 'short',
      }),
    /12 characters/,
  );
  assert.equal(
    readEnv({
      SUPABASE_URL: 'https://x.supabase.co/',
      SERVICE_KEY: 'k',
      REVIEW_PASSWORD: 'long-enough-pw',
    }).url,
    'https://x.supabase.co',
  );
});
