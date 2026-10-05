// Browser helpers for the public site (landing, help, delete). Plain fetch against
// Supabase with the public (publishable) key only; pure enough to test with a
// fake fetch (test/client.test.ts).

export type Env = { url: string; key: string };
type Fetch = typeof fetch;

export type CampusProgress = {
  slug: string;
  name: string;
  status: 'live' | 'waitlist';
  members: number;
  threshold: number;
};

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const b = body as {
      error?: string;
      msg?: string;
      message?: string;
      error_code?: string;
    } | null;
    throw new Error(b?.error ?? b?.error_code ?? b?.msg ?? b?.message ?? `HTTP_${res.status}`);
  }
  return body as T;
}

function headers(env: Env, token?: string): Record<string, string> {
  return {
    apikey: env.key,
    authorization: `Bearer ${token ?? env.key}`,
    'content-type': 'application/json',
  };
}

export async function campusProgress(env: Env, f: Fetch = fetch): Promise<CampusProgress[]> {
  const res = await f(`${env.url}/rest/v1/rpc/public_campus_progress`, {
    method: 'POST',
    headers: headers(env),
    body: '{}',
  });
  return json<CampusProgress[]>(res);
}

/** "312 of 500 students" and the bar width, capped at 100%. */
export function progressLine(c: CampusProgress): { text: string; percent: number } {
  if (c.status === 'live') return { text: `Open at ${c.name}`, percent: 100 };
  const percent = Math.min(100, Math.round((c.members / Math.max(c.threshold, 1)) * 100));
  return { text: `${c.members} of ${c.threshold} students at ${c.name}`, percent };
}

/** W01 school check: an .edu address is required; everything else goes to the waitlist function. */
export function schoolEmailProblem(email: string): string | null {
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return 'Enter your school email.';
  if (!e.endsWith('.edu')) return 'Use your school email. It ends in .edu.';
  return null;
}

export async function joinWaitlist(
  env: Env,
  email: string,
  turnstileToken: string,
  f: Fetch = fetch,
  inviteCode?: string,
): Promise<void> {
  const body: Record<string, string> = {
    email: email.trim().toLowerCase(),
    turnstile_token: turnstileToken,
  };
  // /i/:code carries the invite along (R11-INVITE-01); the function ignores fields it doesn't use.
  if (inviteCode) body.invite_code = inviteCode;
  const res = await f(`${env.url}/functions/v1/waitlist-request`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify(body),
  });
  await json(res);
}

export type School = { name: string; short_name: string; status: string };

/** lookup_school(domain): the campus for a student email domain, or null. */
export async function lookupSchool(
  env: Env,
  domain: string,
  f: Fetch = fetch,
): Promise<School | null> {
  const res = await f(`${env.url}/rest/v1/rpc/lookup_school`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify({ domain }),
  });
  return json<School | null>(res);
}

/** Campus slugs in /joined?campus= (the only thing the URL carries, never the email). */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export type JoinedTarget =
  { kind: 'waitlist'; slug: string } | { kind: 'live'; name: string } | { kind: 'unknown' };

/**
 * After a waitlist join (R11-INVITE-01): which campus the email belongs to, so the
 * page can go to /joined?campus=<slug> (waitlist) or say the school is already open.
 * Any lookup failure falls back to the plain /joined page.
 */
export async function joinedTarget(
  env: Env,
  email: string,
  f: Fetch = fetch,
): Promise<JoinedTarget> {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  if (!domain) return { kind: 'unknown' };
  try {
    const school = await lookupSchool(env, domain, f);
    if (!school) return { kind: 'unknown' };
    const rows = await campusProgress(env, f);
    const row = rows.find((c) => c.name === school.name);
    if (!row) return { kind: 'unknown' };
    if (row.status === 'live') return { kind: 'live', name: row.name };
    return SLUG_RE.test(row.slug) ? { kind: 'waitlist', slug: row.slug } : { kind: 'unknown' };
  } catch {
    return { kind: 'unknown' };
  }
}

export function joinedHref(t: JoinedTarget): string {
  return t.kind === 'waitlist' ? `/joined?campus=${encodeURIComponent(t.slug)}` : '/joined';
}

export const OPEN_NOW_LINE = (name: string) =>
  `${name} is open now. Get the app and sign in with your school email.`;

/** W06 /joined copy for the campus in the URL (or none). */
export function joinedCopy(c: CampusProgress | null): {
  heading: string;
  line: string;
  percent: number | null;
  next: string;
} {
  if (!c) {
    return {
      heading: "You're on the list",
      line: "We'll let you know when your school opens.",
      percent: null,
      next: "We'll email you once when your school opens on OnlySwap. Then get the app and sign in with your school email.",
    };
  }
  if (c.status === 'live') {
    return {
      heading: `${c.name} is open`,
      line: OPEN_NOW_LINE(c.name),
      percent: 100,
      next: 'Get the app and sign in with your school email to start buying and selling.',
    };
  }
  const { text, percent } = progressLine(c);
  const left = Math.max(c.threshold - c.members, 0);
  return {
    heading: `You're on the list for ${c.name}`,
    line: left > 0 ? `${text}. ${left} more to open.` : `${text}. Opening soon.`,
    percent,
    next: `We'll email you once when ${c.name} opens. Then get the app and sign in with your school email.`,
  };
}

export type Topic = 'general' | 'cant_access_email' | 'safety' | 'bug' | 'other';

export async function sendSupport(
  env: Env,
  input: { email: string; topic: Topic; body: string; turnstileToken: string },
  f: Fetch = fetch,
): Promise<void> {
  const res = await f(`${env.url}/functions/v1/support-request`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify({
      email: input.email.trim(),
      topic: input.topic,
      body: input.body.trim(),
      turnstile_token: input.turnstileToken,
    }),
  });
  await json(res);
}

/** W04 step 1: email a sign-in code (existing accounts only). */
export async function sendCode(env: Env, email: string, f: Fetch = fetch): Promise<void> {
  const res = await f(`${env.url}/auth/v1/otp`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify({ email: email.trim().toLowerCase(), create_user: false }),
  });
  await json(res);
}

/** W04 step 2: the code → an access token for this page only (never stored). */
export async function verifyCode(
  env: Env,
  email: string,
  code: string,
  f: Fetch = fetch,
): Promise<string> {
  const res = await f(`${env.url}/auth/v1/verify`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify({ type: 'email', email: email.trim().toLowerCase(), token: code.trim() }),
  });
  const body = await json<{ access_token?: string }>(res);
  if (!body.access_token) throw new Error('INVALID_CODE');
  return body.access_token;
}

/** W04 step 3: the same delete-account function the app uses (typed DELETE confirm). */
export async function deleteAccount(env: Env, token: string, f: Fetch = fetch): Promise<void> {
  const res = await f(`${env.url}/functions/v1/delete-account`, {
    method: 'POST',
    headers: headers(env, token),
    body: JSON.stringify({ confirm: 'DELETE' }),
  });
  await json(res);
}

/** Error codes → plain words for the page. */
export function friendly(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (m.startsWith('RATE_LIMITED') || m === 'over_email_send_rate_limit')
    return 'Too many tries. Wait a few minutes and try again.';
  if (m.includes('turnstile'))
    return "We couldn't check you're a person. Reload the page and try again.";
  if (m === 'INVALID_CODE' || m === 'otp_expired' || m.includes('expired') || m.includes('invalid'))
    return "That code didn't work. Check it or ask for a new one.";
  if (m === 'otp_disabled' || m.includes('Signups not allowed') || m === 'user_not_found')
    return "There's no OnlySwap account with that email.";
  if (m.startsWith('INVALID:email')) return 'Check the email address.';
  if (m.startsWith('INVALID:body')) return 'Add a few more words about what happened.';
  return 'Something went wrong. Try again in a minute.';
}
