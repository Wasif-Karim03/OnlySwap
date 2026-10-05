// Pure helpers for the admin console (tested with node:test).

/** Admin sessions end 8 hours after sign-in (P12-ADM-02). */
export const SESSION_MS = 8 * 60 * 60 * 1000;

export function sessionExpired(signedInAt: number | null, now: number): boolean {
  return signedInAt === null || now - signedInAt > SESSION_MS;
}

export type Whoami = {
  admin: boolean;
  role?: 'owner' | 'moderator';
  campus_id?: string | null;
  aal?: string;
  name?: string;
};

/** What the guard shows: sign in, not an admin, MFA step, or the console. */
export function gate(session: boolean, who: Whoami | null): 'login' | 'denied' | 'mfa' | 'ok' {
  if (!session) return 'login';
  if (!who) return 'login';
  if (!who.admin) return 'denied';
  if (who.aal !== 'aal2') return 'mfa';
  return 'ok';
}

/** CSV with quoting for the audit export. */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const cell = (v: unknown) => {
    const s =
      v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join(
    '\n',
  );
}

export const REPORT_ACTIONS = [
  'dismiss',
  'remove_content',
  'warn',
  'strike',
  'suspend',
  'ban',
] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

/** Which report actions this admin may take (ban is owner only; remove only for content targets). */
export function allowedActions(role: 'owner' | 'moderator', targetType: string): ReportAction[] {
  return REPORT_ACTIONS.filter(
    (a) =>
      (a !== 'ban' || role === 'owner') &&
      (a !== 'remove_content' || targetType === 'listing' || targetType === 'message'),
  );
}

/** A moderator may pause or suspend for at most 7 days. */
export function maxUntil(role: 'owner' | 'moderator', now: Date): Date | null {
  return role === 'owner' ? null : new Date(now.getTime() + 7 * 86_400_000);
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(
    'en-US',
    {
      hour: 'numeric',
      minute: '2-digit',
    },
  )}`;
}

/** Server error text → something readable ("NOT_ADMIN" → "You need an admin account with MFA."). */
export function errorMessage(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  const code = m.split(':')[0] ?? '';
  const known: Record<string, string> = {
    NOT_ADMIN: 'You need an admin account with MFA, and the right role, for that.',
    INVALID: 'Something in the form needs a fix.',
    NOT_FOUND: 'That no longer exists.',
    FORBIDDEN: "That isn't allowed.",
  };
  if (m === 'FORBIDDEN:mfa_required') return 'Confirm with a fresh authenticator code first.';
  if (code === 'RATE_LIMITED') {
    const at = rateLimitRetryAt(m);
    return at
      ? `Limit reached. Try again after ${formatWhen(at)}.`
      : 'Limit reached. Try again later.';
  }
  return known[code] ?? m;
}

/** "RATE_LIMITED:quad_reveal:2026-10-05T00:00:00Z" -> the retry time (ISO), or null. */
export function rateLimitRetryAt(message: string): string | null {
  const m = /^RATE_LIMITED:[a-z_]+:(.+)$/.exec(message);
  if (!m || Number.isNaN(Date.parse(m[1]!))) return null;
  return m[1]!;
}

// ---------------------------------------------------------------------------
// Quad moderation (R11-ADM-03)

export const QUAD_VIEWS = [
  { id: 'held', label: 'Held' },
  { id: 'hidden', label: 'Hidden by votes' },
  { id: 'reported', label: 'Reported' },
] as const;
export type QuadView = (typeof QUAD_VIEWS)[number]['id'];

/** Why a Quad post or reply was held or hidden, in plain words. */
export function holdReasonLabel(reason: string | null | undefined): string {
  if (!reason) return '';
  if (reason.startsWith('term:')) return `Review word: ${reason.slice(5)}`;
  const known: Record<string, string> = {
    names_student: 'Names a student',
    new_account_photo: 'New account photo',
    downvoted: 'Hidden by votes',
    reports: '3+ reports',
    author_deleted: 'Author deleted their account',
  };
  return known[reason] ?? reason;
}

/** Only the owner may reveal who wrote a Quad post (T-INT-ADMIN-03). */
export function canReveal(who: Pick<Whoami, 'admin' | 'role' | 'aal'>): boolean {
  return who.admin && who.role === 'owner' && who.aal === 'aal2';
}

/** Form check before a reveal: case ref and reason 3+ characters, a 6-digit code. */
export function revealFormError(caseRef: string, reason: string, code: string): string | null {
  if (caseRef.trim().length < 3) return 'Add a case reference of at least 3 characters.';
  if (reason.trim().length < 3) return 'Add a reason of at least 3 characters.';
  if (!/^\d{6}$/.test(code.trim())) return 'Enter the 6-digit code from your authenticator app.';
  return null;
}

/** Short age: "now", "12m", "5h", "3d". */
export function ageLabel(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}
