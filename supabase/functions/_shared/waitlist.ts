// waitlist-request core (P4-AUTH-11, API §5, F06). No imports, so the Edge
// Function (Deno) and Node tests (T-FN-06) run the same code.
//
// Anyone may ask to hear when their school opens. The answer is the same
// `{ ok: true }` whether the address is new, already listed or on a school we
// already support (SEC-12, T16), so it can't be used to probe the list.
// Browsers (requests with an Origin header, i.e. the website) must pass a
// Turnstile token; the app calls without one.

export type WaitlistDeps = {
  /** Cloudflare Turnstile siteverify; true when the token is valid. */
  verifyTurnstile: (token: string, ip: string | null) => Promise<boolean>;
  /** private.record_waitlist_request: validates, IP-limits (5/h) and stores. Throws P0001 codes. */
  record: (email: string, ip: string | null) => Promise<void>;
  log?: (event: string, data?: Record<string, unknown>) => void;
};

export type WaitlistRequest = {
  method: string;
  /** The browser Origin header, or null for the app. */
  origin: string | null;
  ip: string | null;
  body: unknown;
};

export type WaitlistResponse = { status: number; body: Record<string, unknown> };

const fail = (status: number, code: string): WaitlistResponse => ({
  status,
  body: { error: code },
});

/**
 * cf-connecting-ip when present (set by Cloudflare, not by the caller), else
 * the first x-forwarded-for address (as private.client_ip_key does).
 */
export function clientIp(headers: { get: (name: string) => string | null }): string | null {
  const cf = headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
}

export const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-max-age': '86400',
} as const;

export async function handleWaitlist(
  req: WaitlistRequest,
  deps: WaitlistDeps,
): Promise<WaitlistResponse> {
  if (req.method === 'OPTIONS') return { status: 204, body: {} };
  if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED');

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
    string,
    unknown
  >;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail(400, 'INVALID:email');
  }

  if (req.origin) {
    const token = typeof body.turnstile_token === 'string' ? body.turnstile_token : '';
    let passed = false;
    try {
      passed = token.length > 0 && (await deps.verifyTurnstile(token, req.ip));
    } catch {
      passed = false;
    }
    if (!passed) return fail(400, 'INVALID:turnstile_token');
  }

  try {
    await deps.record(email, req.ip);
  } catch (error) {
    const message =
      typeof (error as { message?: unknown } | null)?.message === 'string'
        ? (error as { message: string }).message
        : '';
    if (message.startsWith('RATE_LIMITED')) return fail(429, message);
    if (message.startsWith('INVALID')) return fail(400, 'INVALID:email');
    deps.log?.('waitlist_request.failed');
    return fail(500, 'UNKNOWN');
  }
  return { status: 200, body: { ok: true } };
}

/** Calls Cloudflare's siteverify endpoint. */
export async function turnstileVerify(
  secret: string,
  token: string,
  ip: string | null,
  doFetch: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<boolean> {
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set('remoteip', ip);
  const res = await doFetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success?: unknown };
  return data.success === true;
}
