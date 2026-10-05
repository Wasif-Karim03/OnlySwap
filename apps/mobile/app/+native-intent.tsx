import { rememberInviteCode } from '@/features/auth/invite';
import { inviteCodeFromLink, rewriteDeepLink } from '@/lib/deeplinks';

/**
 * Maps universal links / App Links onto app routes (P11-STATE-02):
 * https://site/l/{id} opens the listing; https://site/i/{code} (or
 * onlyswap://i/{code}) keeps the invite code for the sign-up and opens the
 * launch gate (R11-INVITE-01).
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  const invite = inviteCodeFromLink(path);
  if (invite) rememberInviteCode(invite);
  return rewriteDeepLink(path);
}
