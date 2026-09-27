// Internal Edge Functions (revoke-sessions, admin-change-email) are called
// only with the service key: by the database through pg_net or by other
// functions (API §5, T-SEC-14). No imports, so Node tests run this too.

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when the bearer token is one of the accepted service keys. */
export function isServiceCaller(
  authorization: string | null,
  keys: (string | undefined)[],
): boolean {
  const token = /^Bearer\s+(.+)$/i.exec(authorization ?? '')?.[1]?.trim() ?? '';
  return keys.some((k) => typeof k === 'string' && k.length > 0 && safeEqual(token, k));
}

export type InternalResponse = { status: number; body: Record<string, unknown> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Req = { method: string; authorization: string | null; body: unknown };

function parse(req: Req, keys: (string | undefined)[]): InternalResponse | Record<string, unknown> {
  if (req.method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
  if (!isServiceCaller(req.authorization, keys)) {
    return { status: 401, body: { error: 'NOT_AUTHENTICATED' } };
  }
  return (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
}

const isResponse = (x: unknown): x is InternalResponse =>
  typeof x === 'object' &&
  x !== null &&
  'status' in x &&
  typeof (x as InternalResponse).status === 'number';

/**
 * revoke-sessions (P4-AUTH-18, ARC-01): `{ user_id }` → every session of the
 * user is deleted, so no device can refresh its token.
 */
export async function handleRevokeSessions(
  req: Req,
  deps: { keys: (string | undefined)[]; revoke: (userId: string) => Promise<number> },
): Promise<InternalResponse> {
  const body = parse(req, deps.keys);
  if (isResponse(body)) return body;
  const userId = String(body.user_id ?? '');
  if (!UUID.test(userId)) return { status: 400, body: { error: 'INVALID:user_id' } };
  try {
    const revoked = await deps.revoke(userId);
    return { status: 200, body: { ok: true, revoked } };
  } catch {
    return { status: 500, body: { error: 'UNKNOWN' } };
  }
}

/**
 * admin-change-email (P4-AUTH-19, PM-03): `{ user_id, new_email }` → the Auth
 * address changes (unconfirmed until the person signs in with a code sent to
 * it) and every old session is revoked. The database trigger moves the
 * profile to the new address's campus.
 */
export async function handleAdminChangeEmail(
  req: Req,
  deps: {
    keys: (string | undefined)[];
    updateEmail: (userId: string, email: string) => Promise<void>;
    revoke: (userId: string) => Promise<number>;
  },
): Promise<InternalResponse> {
  const body = parse(req, deps.keys);
  if (isResponse(body)) return body;
  const userId = String(body.user_id ?? '');
  const email = typeof body.new_email === 'string' ? body.new_email.trim().toLowerCase() : '';
  if (!UUID.test(userId)) return { status: 400, body: { error: 'INVALID:user_id' } };
  if (!EMAIL.test(email) || email.length > 254) {
    return { status: 400, body: { error: 'INVALID:new_email' } };
  }
  try {
    await deps.updateEmail(userId, email);
    await deps.revoke(userId);
    return { status: 200, body: { ok: true } };
  } catch {
    return { status: 500, body: { error: 'UNKNOWN' } };
  }
}
