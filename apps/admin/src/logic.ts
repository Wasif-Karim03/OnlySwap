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
  return known[code] ?? m;
}
