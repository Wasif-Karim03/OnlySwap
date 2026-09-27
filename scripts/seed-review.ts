// Reviewer accounts for App Store / Play review (P4-AUTH-15, F07, DEC 6).
// Creates, idempotently, on the target project:
//   * the Demo University campus (is_demo, live) and its domain
//     review.onlyswap.test, so reviewers never touch a real school;
//   * review_accounts rows (the only addresses the demo campus admits, and the
//     only ones allowed to sign in with a password: SECURITY T2);
//   * the Auth users with the password, already onboarded (name, 18+, rules),
//     so the reviewer opens straight to the feed.
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
    REVIEWERS.map((r) => ({ email: r.email, note: r.note })),
    'email',
  );
  log(`campus ${DEMO_CAMPUS.name} and ${REVIEWERS.length} review_accounts rows ready`);

  const rules = (await rest('app_config?select=value&key=eq.rules_version'))[0]?.value ?? '1';

  for (const r of REVIEWERS) {
    const create = await doFetch(`${env.url}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: r.email, password: env.password, email_confirm: true }),
    });
    let id: string | undefined;
    if (create.ok) {
      id = ((await create.json()) as { id?: string }).id;
      log(`created ${r.email}`);
    } else {
      // Already there: find it and reset the password so it matches this run.
      const list = await doFetch(`${env.url}/auth/v1/admin/users?per_page=1000`, { headers });
      const users =
        ((await list.json()) as { users?: { id: string; email: string }[] }).users ?? [];
      id = users.find((u) => u.email?.toLowerCase() === r.email)?.id;
      if (!id) throw new Error(`could not create or find ${r.email}: HTTP ${create.status}`);
      const upd = await doFetch(`${env.url}/auth/v1/admin/users/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ password: env.password, email_confirm: true }),
      });
      if (!upd.ok) throw new Error(`could not update ${r.email}: HTTP ${upd.status}`);
      log(`updated ${r.email}`);
    }
    await rest(`profiles?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        first_name: r.first_name,
        last_initial: 'R',
        status: 'active',
        adult_confirmed_at: new Date().toISOString(),
        age_method: 'self_declared',
        rules_accepted_at: new Date().toISOString(),
        rules_version: rules,
      }),
    });
  }
  log('reviewer accounts are ready: sign in with the email and the password you entered');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedReview(readEnv(process.env)).catch((e: unknown) => {
    console.error(`seed-review failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
