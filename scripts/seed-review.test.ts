// P4-AUTH-15: seed-review is idempotent and never logs the password.
// R11-REL-01: the reviewer campus shows every R1.1 feature (Quad, Around campus).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AROUND_CAMPUS,
  DEMO_BOT,
  DEMO_CAMPUS,
  QUAD_POLL_OPTIONS,
  QUAD_POSTS,
  QUAD_REPLIES,
  readEnv,
  REVIEWERS,
  seedReview,
} from './seed-review.ts';

function fakeProject(existing: string[] = [], quadSwitch = 'false') {
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
    if (path.startsWith('/rest/v1/app_config?select=value&key=eq.rules_version'))
      return new Response('[{"value":"3"}]', { status: 200 });
    if (path.startsWith('/rest/v1/app_config?select=value&key=eq.quad_enabled'))
      return new Response(`[{"value":${quadSwitch}}]`, { status: 200 });
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  return { f, calls };
}

type Json = Record<string, unknown>;

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
  assert.equal(created.length, REVIEWERS.length + 1);
  assert.deepEqual((created[0]?.body as { email_confirm: boolean }).email_confirm, true);
  const patches = calls.filter((c) => c.method === 'PATCH');
  assert.equal(patches.length, REVIEWERS.length + 1);
  assert.equal((patches[0]?.body as { rules_version: string }).rules_version, '3');
  assert.ok(
    lines.every((l) => !l.includes(env.password)),
    'the password is never printed',
  );
});

test('running it again updates the existing users instead of failing', async () => {
  const { f, calls } = fakeProject([...REVIEWERS.map((r) => r.email), DEMO_BOT.email]);
  await seedReview(env, f, () => {});
  // Only reviewers get their password reset; the bot has none.
  assert.equal(calls.filter((c) => c.method === 'PUT').length, REVIEWERS.length);
});

test('the demo campus has the Quad on and the bot has no password', async () => {
  const { f, calls } = fakeProject();
  await seedReview(env, f, () => {});
  const campus = calls.find((c) => c.method === 'POST' && c.path.startsWith('/rest/v1/campuses'));
  assert.equal((campus?.body as { quad_enabled: boolean }[])[0]?.quad_enabled, true);
  const accounts = calls.find(
    (c) => c.method === 'POST' && c.path.startsWith('/rest/v1/review_accounts'),
  )?.body as { email: string; note: string }[];
  const botRow = accounts.find((a) => a.email === DEMO_BOT.email);
  assert.ok(botRow, 'the bot is admitted to the demo campus');
  assert.ok(!/reviewer/i.test(botRow.note), 'demo_autoplay treats the bot as a bot');
  const botCreate = calls.find(
    (c) =>
      c.method === 'POST' &&
      c.path === '/auth/v1/admin/users' &&
      (c.body as { email: string }).email === DEMO_BOT.email,
  );
  assert.equal((botCreate?.body as { password?: string }).password, undefined);
  const botPatch = calls.find(
    (c) => c.method === 'PATCH' && c.path === `/rest/v1/profiles?id=eq.new-${DEMO_BOT.email}`,
  );
  assert.ok((botPatch?.body as { quad_rules_accepted_at?: string }).quad_rules_accepted_at);
  // Reviewers see the Quad rules themselves.
  const reviewerPatch = calls.find(
    (c) => c.method === 'PATCH' && c.path === `/rest/v1/profiles?id=eq.new-${REVIEWERS[0]!.email}`,
  );
  assert.equal(
    (reviewerPatch?.body as { quad_rules_accepted_at?: string }).quad_rules_accepted_at,
    undefined,
  );
});

test('seeds Quad posts, a reply, a poll and Around campus posts with fixed ids', async () => {
  const { f, calls } = fakeProject();
  await seedReview(env, f, () => {});
  const body = (table: string) =>
    calls.find((c) => c.method === 'POST' && c.path.startsWith(`/rest/v1/${table}?`)) as
      { path: string; body: Json[] } | undefined;
  const posts = body('quad_posts');
  assert.match(posts!.path, /on_conflict=id/);
  assert.equal(posts!.body.length, QUAD_POSTS.length);
  assert.ok(posts!.body.some((p) => p.kind === 'poll'));
  assert.ok(posts!.body.every((p) => p.campus_id === DEMO_CAMPUS.id && p.status === 'live'));
  assert.ok(posts!.body.every((p) => p.author_id === `new-${DEMO_BOT.email}`));
  const withReply = posts!.body.find((p) => p.id === QUAD_REPLIES[0]!.post_id);
  assert.equal(withReply?.reply_count, 1);
  const options = body('quad_poll_options');
  assert.match(options!.path, /on_conflict=post_id,idx/);
  assert.equal(options!.body.length, QUAD_POLL_OPTIONS.length);
  assert.equal(body('quad_replies')!.body.length, QUAD_REPLIES.length);
  const around = body('listings');
  assert.match(around!.path, /on_conflict=id/);
  assert.equal(around!.body.length, AROUND_CAMPUS.length);
  const kinds = new Set(around!.body.map((l) => l.kind));
  assert.deepEqual([...kinds].sort(), ['free', 'wanted']);
  assert.ok(around!.body.every((l) => Date.parse(String(l.expires_at)) > Date.now()));
  // Every bulk upsert has the same keys in each row (PostgREST needs that).
  for (const t of ['quad_posts', 'quad_replies', 'listings']) {
    const keys = body(t)!.body.map((r) => Object.keys(r).sort().join(','));
    assert.equal(new Set(keys).size, 1, t);
  }
  // Same ids on a second run: nothing is added twice.
  const again = fakeProject();
  await seedReview(env, again.f, () => {});
  const ids = (cs: typeof calls) =>
    (cs.find((c) => c.path.startsWith('/rest/v1/quad_posts?'))!.body as Json[]).map((p) => p.id);
  assert.deepEqual(ids(again.calls), ids(calls));
});

test('warns, without changing app_config, when the global Quad switch is off', async () => {
  const off = fakeProject();
  const lines: string[] = [];
  await seedReview(env, off.f, (l) => lines.push(l));
  assert.ok(lines.some((l) => l.includes('app_config.quad_enabled')));
  assert.ok(
    off.calls.every((c) => !(c.path.startsWith('/rest/v1/app_config') && c.method !== 'GET')),
    'never writes app_config',
  );
  const on = fakeProject([], 'true');
  const quiet: string[] = [];
  await seedReview(env, on.f, (l) => quiet.push(l));
  assert.ok(quiet.every((l) => !l.includes('app_config.quad_enabled')));
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
