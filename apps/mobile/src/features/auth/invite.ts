import { getStorage, type TypedStorage } from '@/lib/storage';

/**
 * R11-INVITE-01: an /i/{code} link opened before sign-up. The code waits on
 * the device and goes out with the first sendCode (raw_user_meta_data
 * invite_code), so the new account credits the inviter. The server only
 * reads it when it creates the account, so sending it for an existing
 * address does nothing.
 */
export const INVITE_KEEP_MS = 30 * 24 * 3600 * 1000;

export type InviteStorage = Pick<TypedStorage, 'get' | 'set' | 'remove'>;

const store = (s?: InviteStorage): InviteStorage | null => {
  if (s) return s;
  try {
    return getStorage();
  } catch {
    return null;
  }
};

export function rememberInviteCode(
  code: string,
  storage?: InviteStorage,
  now: Date = new Date(),
): void {
  store(storage)?.set('auth.inviteCode', { code, savedAt: now.toISOString() });
}

/** The waiting code, or undefined (none, or older than 30 days). */
export function pendingInviteCode(
  storage?: InviteStorage,
  now: Date = new Date(),
): string | undefined {
  const s = store(storage);
  const saved = s?.get('auth.inviteCode');
  if (!saved || typeof saved.code !== 'string') return undefined;
  const at = Date.parse(saved.savedAt);
  if (!Number.isFinite(at) || now.getTime() - at > INVITE_KEEP_MS) {
    s?.remove('auth.inviteCode');
    return undefined;
  }
  return saved.code;
}

/** After the code sign-in worked: the account exists, so the code is spent. */
export function clearInviteCode(storage?: InviteStorage): void {
  store(storage)?.remove('auth.inviteCode');
}

/** sendCode with the waiting invite code, when there is one. */
export function sendCodeWithInvite(
  api: { sendCode: (email: string, options?: { inviteCode?: string }) => Promise<void> },
  email: string,
  inviteCode: string | undefined = pendingInviteCode(),
): Promise<void> {
  return inviteCode ? api.sendCode(email, { inviteCode }) : api.sendCode(email);
}
