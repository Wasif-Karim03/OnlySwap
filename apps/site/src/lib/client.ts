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
): Promise<void> {
  const res = await f(`${env.url}/functions/v1/waitlist-request`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify({ email: email.trim().toLowerCase(), turnstile_token: turnstileToken }),
  });
  await json(res);
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
