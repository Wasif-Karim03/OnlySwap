// Reviewer accounts for App Store / Play review (P4-AUTH-15, F07, DEC 6).
// Creates, idempotently, on the target project:
//   * the Demo University campus (is_demo, live) and its domain
//     review.onlyswap.test, so reviewers never touch a real school;
//   * review_accounts rows (the only addresses the demo campus admits, and the
//     only ones allowed to sign in with a password: SECURITY T2);
//   * the Auth users with the password, already onboarded (name, 18+, rules),
//     so the reviewer opens straight to the feed;
//   * the demo seller bot (no password: nobody signs in as it; demo_autoplay
//     answers for it because its review_accounts note has no "reviewer");
//   * R1.1 content so reviewers see every feature (Apple 2.3.1, DEC 76/77(i)):
//     campuses.quad_enabled on the demo campus, a few Quad posts, a reply and a
//     poll, and Around campus posts (Wanted and free items; free food can't be
//     seeded because it expires within 3 hours). Everything uses fixed ids, so a
//     second run updates rows instead of adding more.
// The Quad also needs the global kill switch app_config.quad_enabled. This
// script never changes app_config: it only warns when the switch is off. The
// owner turns it on in admin Config (it's audited there).
//
//   SUPABASE_URL=https://<ref>.supabase.co SERVICE_KEY=... REVIEW_PASSWORD=... \
//     node --experimental-strip-types scripts/seed-review.ts
// Never put the service key or the password in a file or in chat: the
// wrapper `bash scripts/seed-review.sh` asks for both at a hidden prompt.

type Json = Record<string, unknown>;

export const DEMO_CAMPUS = {
  id: '10000000-0000-4000-8000-000000000002',
  slug: 'demo',
  name: 'Demo University',
  short_name: 'Demo U',
  status: 'live',
  timezone: 'America/New_York',
  is_demo: true,
  quad_enabled: true,
};
export const DEMO_DOMAIN = 'review.onlyswap.test';
export const REVIEWERS = [
  {
    email: 'appreview@review.onlyswap.test',
    first_name: 'Alex',
    note: 'App Store reviewer (password login)',
  },
  {
    email: 'playreview@review.onlyswap.test',
    first_name: 'Robin',
    note: 'Play reviewer (password login)',
  },
];

// The demo seller. Its note must not contain "reviewer": demo_autoplay treats
// every other demo campus account as a bot that accepts offers and replies.
export const DEMO_BOT = {
  email: 'sam@review.onlyswap.test',
  first_name: 'Sam',
  last_initial: 'D',
  note: 'Demo University seller (bot)',
};

const day = 24 * 60 * 60 * 1000;
const hour = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();

const qid = (n: number) => `32000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const lid = (n: number) => `33000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Quad posts by the bot. Plain campus talk: no names, places that exist only on
// the fictional campus, nothing a filter would hold.
export const QUAD_POSTS = [
  { id: qid(1), kind: 'text', body: 'Where do people study late on campus?', score: 9, h: 2 },
  { id: qid(2), kind: 'text', body: 'The dining hall waffles are back', score: 14, h: 6 },
  { id: qid(3), kind: 'text', body: 'Tips for a first-year moving in next week?', score: 6, h: 30 },
  { id: qid(4), kind: 'poll', body: 'Best time to hit the gym?', score: 11, h: 4 },
];
export const QUAD_POLL_OPTIONS = [
  { post_id: qid(4), idx: 1, label: 'Early morning', votes: 8 },
  { post_id: qid(4), idx: 2, label: 'After class', votes: 5 },
  { post_id: qid(4), idx: 3, label: 'Late night', votes: 7 },
];
// alias 0 is the original poster: the bot follows up on its own thread.
export const QUAD_REPLIES = [
  {
    id: qid(101),
    post_id: qid(1),
    body: 'Update: the student center stays open until 10',
    alias_no: 0,
    h: 1,
  },
];

// Around campus (C01 to C03): Wanted posts and free items.
export const AROUND_CAMPUS = [
  {
    id: lid(1),
    kind: 'wanted',
    title: 'Desk lamp',
    description: 'Anything that clamps to a desk.',
    category_id: 9,
    condition: null,
    wanted_max_cents: 1500,
    h: 3,
  },
  {
    id: lid(2),
    kind: 'wanted',
    title: 'Graphing calculator',
    description: 'Need one before the first exam.',
    category_id: 3,
    condition: null,
    wanted_max_cents: 4000,
    h: 20,
  },
  {
    id: lid(3),
    kind: 'free',
    title: 'Moving boxes',
    description: 'About 10 boxes, free to whoever picks them up.',
    category_id: 99,
    condition: 'fair',
    wanted_max_cents: null,
    h: 5,
  },
  {
    id: lid(4),
    kind: 'free',
    title: 'Free notebooks',
    description: 'Five unused spiral notebooks.',
    category_id: 99,
    condition: 'new',
    wanted_max_cents: null,
    h: 26,
  },
];

export type SeedEnv = { url: string; serviceKey: string; password: string };

export function readEnv(env: Record<string, string | undefined>): SeedEnv {
  const url = (env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const serviceKey = env.SERVICE_KEY ?? '';
  const password = env.REVIEW_PASSWORD ?? '';
  if (!/^https?:\/\//.test(url)) throw new Error('SUPABASE_URL must be set');
  if (!serviceKey) throw new Error('SERVICE_KEY must be set');
  if (password.length < 12) throw new Error('REVIEW_PASSWORD must be at least 12 characters');
  return { url, serviceKey, password };
}

export async function seedReview(
  env: SeedEnv,
  doFetch: typeof fetch = fetch,
  log: (line: string) => void = console.log,
): Promise<void> {
  const headers = {
    apikey: env.serviceKey,
    authorization: `Bearer ${env.serviceKey}`,
    'content-type': 'application/json',
  };
  const rest = async (path: string, init: RequestInit & { prefer?: string } = {}) => {
    const res = await doFetch(`${env.url}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, prefer: init.prefer ?? 'return=representation' },
    });
    if (!res.ok)
      throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]}: HTTP ${res.status}`);
    const text = await res.text();
    return text ? (JSON.parse(text) as Json[]) : [];
  };
  const upsert = (table: string, rows: Json[], onConflict: string) =>
    rest(`${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      body: JSON.stringify(rows),
      prefer: 'resolution=merge-duplicates,return=representation',
    });

  await upsert('campuses', [DEMO_CAMPUS], 'id');
  await upsert(
    'campus_domains',
    [{ domain: DEMO_DOMAIN, campus_id: DEMO_CAMPUS.id, kind: 'student' }],
    'domain',
  );
  await upsert(
    'review_accounts',
    [...REVIEWERS, DEMO_BOT].map((r) => ({ email: r.email, note: r.note })),
    'email',
  );
  log(`campus ${DEMO_CAMPUS.name} and ${REVIEWERS.length + 1} review_accounts rows ready`);

  const config = async (key: string) =>
    (await rest(`app_config?select=value&key=eq.${key}`))[0]?.value;
  const rules = (await config('rules_version')) ?? '1';

  // Creates the Auth user, or finds it when it exists. With a password, an
  // existing user gets it reset so it matches this run.
  const ensureUser = async (email: string, password?: string): Promise<string> => {
    const create = await doFetch(`${env.url}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify(
        password ? { email, password, email_confirm: true } : { email, email_confirm: true },
      ),
    });
    if (create.ok) {
      const id = ((await create.json()) as { id?: string }).id;
      if (!id) throw new Error(`could not create ${email}: no id`);
      log(`created ${email}`);
      return id;
    }
    const list = await doFetch(`${env.url}/auth/v1/admin/users?per_page=1000`, { headers });
    const users = ((await list.json()) as { users?: { id: string; email: string }[] }).users ?? [];
    const id = users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (!id) throw new Error(`could not create or find ${email}: HTTP ${create.status}`);
    if (password) {
      const upd = await doFetch(`${env.url}/auth/v1/admin/users/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ password, email_confirm: true }),
      });
      if (!upd.ok) throw new Error(`could not update ${email}: HTTP ${upd.status}`);
    }
    log(`updated ${email}`);
    return id;
  };

  const onboarded = (first_name: string, last_initial: string) => ({
    first_name,
    last_initial,
    status: 'active',
    adult_confirmed_at: new Date().toISOString(),
    age_method: 'self_declared',
    rules_accepted_at: new Date().toISOString(),
    rules_version: rules,
  });

  for (const r of REVIEWERS) {
    const id = await ensureUser(r.email, env.password);
    // Reviewers keep quad_rules_accepted_at empty, so they see the Quad
    // welcome and rules (Q01) like a real student.
    await rest(`profiles?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(onboarded(r.first_name, 'R')),
    });
  }
  log('reviewer accounts are ready: sign in with the email and the password you entered');

  // The demo seller bot: no password, already agreed to the Quad rules.
  const bot = await ensureUser(DEMO_BOT.email);
  await rest(`profiles?id=eq.${bot}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...onboarded(DEMO_BOT.first_name, DEMO_BOT.last_initial),
      quad_rules_accepted_at: ago(29 * day),
    }),
  });

  await upsert(
    'quad_posts',
    QUAD_POSTS.map((q) => ({
      id: q.id,
      campus_id: DEMO_CAMPUS.id,
      author_id: bot,
      kind: q.kind,
      body: q.body,
      score: q.score,
      status: 'live',
      reply_count: QUAD_REPLIES.filter((r) => r.post_id === q.id).length,
      created_at: ago(q.h * hour),
    })),
    'id',
  );
  await upsert('quad_poll_options', QUAD_POLL_OPTIONS, 'post_id,idx');
  await upsert(
    'quad_replies',
    QUAD_REPLIES.map((r) => ({
      id: r.id,
      post_id: r.post_id,
      author_id: bot,
      body: r.body,
      alias_no: r.alias_no,
      status: 'live',
      created_at: ago(r.h * hour),
    })),
    'id',
  );
  log(
    `Quad: ${QUAD_POSTS.length} posts, ${QUAD_REPLIES.length} reply and a poll on ${DEMO_CAMPUS.name}`,
  );

  await upsert(
    'listings',
    AROUND_CAMPUS.map((l) => ({
      id: l.id,
      campus_id: DEMO_CAMPUS.id,
      seller_id: bot,
      kind: l.kind,
      status: 'active',
      title: l.title,
      description: l.description,
      category_id: l.category_id,
      condition: l.condition,
      price_cents: 0,
      wanted_max_cents: l.wanted_max_cents,
      expires_at: ahead(60 * day),
      created_at: ago(l.h * hour),
      bumped_at: ago(l.h * hour),
      deleted_at: null,
    })),
    'id',
  );
  log(`Around campus: ${AROUND_CAMPUS.length} Wanted and free posts on ${DEMO_CAMPUS.name}`);

  const quadSwitch = await config('quad_enabled');
  if (quadSwitch !== true && quadSwitch !== 'true') {
    log(
      'note: app_config.quad_enabled (the global Quad switch) is off, so reviewers will not see the Quad. ' +
        'Turn it on in admin Config before you submit.',
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedReview(readEnv(process.env)).catch((e: unknown) => {
    console.error(`seed-review failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
