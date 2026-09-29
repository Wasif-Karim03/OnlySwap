// test-inbox (P14-E2E-00, TESTING §3): E2E flows read a fresh sign-in code for
// `e2e+<anything>@e2e.onlyswap.test` addresses. Never on production: the handler
// refuses unless the environment is local or staging, and needs E2E_SECRET.
// The code comes from Auth's admin generateLink (a new email OTP for that user),
// so nothing is stored and no real inbox is involved.

export const E2E_EMAIL = /^e2e\+[a-z0-9._-]{1,40}@e2e\.onlyswap\.test$/;

export type InboxDeps = {
  appEnv: string | undefined;
  supabaseUrl: string | undefined;
  secret: string | undefined;
  generateOtp: (email: string) => Promise<string | null>;
};

export function allowedEnv(appEnv: string | undefined, supabaseUrl: string | undefined): boolean {
  if (appEnv === 'production' || appEnv === 'prod') return false;
  if (appEnv === 'staging' || appEnv === 'local') return true;
  // `supabase functions serve` on a laptop
  return /^http:\/\/(kong|127\.0\.0\.1|localhost|host\.docker\.internal)(:\d+)?/.test(
    supabaseUrl ?? '',
  );
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handleTestInbox(
  req: { method: string; secretHeader: string | null; body: unknown },
  deps: InboxDeps,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!allowedEnv(deps.appEnv, deps.supabaseUrl))
    return { status: 404, body: { error: 'NOT_FOUND' } };
  if (req.method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
  if (
    !deps.secret ||
    deps.secret.length < 16 ||
    !req.secretHeader ||
    !constantTimeEqual(req.secretHeader, deps.secret)
  ) {
    return { status: 401, body: { error: 'NOT_AUTHENTICATED' } };
  }
  const email = String((req.body as { email?: unknown } | null)?.email ?? '')
    .trim()
    .toLowerCase();
  if (!E2E_EMAIL.test(email)) return { status: 400, body: { error: 'INVALID:email' } };
  const code = await deps.generateOtp(email);
  if (!code) return { status: 404, body: { error: 'NO_USER' } };
  return { status: 200, body: { code } };
}
