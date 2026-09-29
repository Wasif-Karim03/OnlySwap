import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';

export type AccountStatus = {
  status: 'active' | 'waitlist' | 'reverify' | 'paused' | 'suspended' | 'banned';
  reason: string | null;
  paused_until: string | null;
  strikes: { id: string; reason: string | null; expires_at: string; created_at: string }[];
  noshows: { id: string; status: 'open' | 'confirmed'; created_at: string }[];
  appeals: {
    id: string;
    subject_type: string;
    subject_id: string;
    status: 'open' | 'upheld' | 'overturned';
    created_at: string;
  }[];
};

export type BlockedPerson = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
  blocked_at: string;
};
export type ReportStatus = {
  id: string;
  status: 'received' | 'reviewed';
  timeline: { event: string; at: string }[];
};
export type AppealSubject = 'strike' | 'noshow' | 'suspension';

/** Safety and account calls (P11-SAFE-02..04). */
export type SafetyApi = {
  status: () => Promise<AccountStatus>;
  appeal: (
    subject: AppealSubject,
    subjectId: string,
    reason: string,
    body: string,
  ) => Promise<void>;
  blocked: () => Promise<BlockedPerson[]>;
  unblock: (userId: string) => Promise<void>;
  report: (id: string) => Promise<ReportStatus>;
};

const rpc = createRpc(() => getSupabase() as unknown as RpcClient);

export const safetyApi: SafetyApi = {
  status: () => rpc<AccountStatus>('get_account_status'),
  appeal: async (subject, subjectId, reason, body) => {
    await rpc('create_appeal', {
      subject_type: subject,
      subject_id: subjectId,
      reason_choice: reason,
      body: body.trim() || null,
    });
  },
  blocked: () => rpc<BlockedPerson[]>('list_blocked'),
  unblock: async (userId) => {
    await rpc('unblock_user', { user_id: userId });
  },
  report: (id) => rpc<ReportStatus>('get_my_report', { id }),
};

/** What an appeal on the status screen is about: the newest open subject not yet appealed. */
export function appealTarget(
  s: AccountStatus,
  me: string | null,
): { subject: AppealSubject; id: string } | null {
  const appealed = new Set(s.appeals.map((a) => `${a.subject_type}:${a.subject_id}`));
  if (s.status === 'suspended' && me && !appealed.has(`suspension:${me}`))
    return { subject: 'suspension', id: me };
  const noshow = s.noshows.find((n) => !appealed.has(`noshow:${n.id}`));
  if (noshow) return { subject: 'noshow', id: noshow.id };
  const strike = s.strikes.find((k) => !appealed.has(`strike:${k.id}`));
  if (strike) return { subject: 'strike', id: strike.id };
  return null;
}
