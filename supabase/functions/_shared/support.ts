// support-request core (P4-AUTH-19, API §5, F20). No imports, so the Edge
// Function (Deno) and Node tests (T-FN-06) run the same code.
//
// Anyone may write to the owner, signed in or not (someone who lost their
// school inbox can't sign in). Browsers must pass Turnstile; the app sends
// none. The IP limit (3/h) and storage happen in SQL.

export const TOPICS = ['general', 'cant_access_email', 'safety', 'bug', 'other'] as const;
export type Topic = (typeof TOPICS)[number];

export type SupportDeps = {
  verifyTurnstile: (token: string, ip: string | null) => Promise<boolean>;
  /** private.record_support_request; throws P0001 codes. */
  record: (email: string, topic: Topic, body: string, ip: string | null) => Promise<void>;
  log?: (event: string) => void;
};

export type SupportRequest = {
  method: string;
  origin: string | null;
  ip: string | null;
  body: unknown;
};
export type SupportResponse = { status: number; body: Record<string, unknown> };

const fail = (status: number, code: string): SupportResponse => ({ status, body: { error: code } });

export async function handleSupport(
  req: SupportRequest,
  deps: SupportDeps,
): Promise<SupportResponse> {
  if (req.method === 'OPTIONS') return { status: 204, body: {} };
  if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED');
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;

  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail(400, 'INVALID:email');
  }
  const topic = b.topic as Topic;
  if (!TOPICS.includes(topic)) return fail(400, 'INVALID:topic');
  const text = typeof b.body === 'string' ? b.body.trim() : '';
  if (text.length < 1 || text.length > 2000) return fail(400, 'INVALID:body');

  if (req.origin) {
    const token = typeof b.turnstile_token === 'string' ? b.turnstile_token : '';
    let passed = false;
    try {
      passed = token.length > 0 && (await deps.verifyTurnstile(token, req.ip));
    } catch {
      passed = false;
    }
    if (!passed) return fail(400, 'INVALID:turnstile_token');
  }

  try {
    await deps.record(email, topic, text, req.ip);
  } catch (error) {
    const message =
      typeof (error as { message?: unknown } | null)?.message === 'string'
        ? (error as { message: string }).message
        : '';
    if (message.startsWith('RATE_LIMITED')) return fail(429, message);
    if (/^INVALID:(email|topic|body)$/.test(message)) return fail(400, message);
    deps.log?.('support_request.failed');
    return fail(500, 'UNKNOWN');
  }
  return { status: 200, body: { ok: true } };
}
