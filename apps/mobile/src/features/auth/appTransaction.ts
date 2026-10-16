/**
 * AR-04: Apple's RESCIND_CONSENT notification (a parent withdrew consent)
 * names the App Store download (appTransactionId), not our user. So on iOS,
 * each signed-in account is linked to this phone's id once per launch.
 * Failures are quiet and retried on the next launch.
 */
import type { AppTransactionNative } from '../../../modules/app-transaction';

type AuthSource = {
  onAuthStateChange: (cb: (event: string, session: { user?: { id: string } } | null) => void) => {
    data: { subscription: { unsubscribe: () => void } };
  };
};

const linked = new Set<string>();

/** Tests only. */
export function resetAppTransactionLinks(): void {
  linked.clear();
}

export async function linkAppTransaction(
  native: AppTransactionNative | null,
  link: (appTransactionId: string) => Promise<void>,
  userId: string,
  os: string,
): Promise<'linked' | 'skipped' | 'failed'> {
  if (os !== 'ios' || !native || linked.has(userId)) return 'skipped';
  try {
    const id = await native.getAppTransactionIdAsync();
    if (!id) return 'skipped';
    await link(id);
    linked.add(userId);
    return 'linked';
  } catch {
    return 'failed';
  }
}

/** Links after sign-in (and for the session restored at launch). */
export function startAppTransactionLink(
  auth: AuthSource,
  native: AppTransactionNative | null,
  link: (appTransactionId: string) => Promise<void>,
  os: string,
): () => void {
  if (os !== 'ios' || !native) return () => {};
  const { data } = auth.onAuthStateChange((event, session) => {
    const userId = session?.user?.id;
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && userId) {
      // Outside the auth callback: awaiting Supabase calls inside it can deadlock.
      setTimeout(() => void linkAppTransaction(native, link, userId, os), 0);
    }
  });
  return () => data.subscription.unsubscribe();
}
