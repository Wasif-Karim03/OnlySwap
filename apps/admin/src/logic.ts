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

// ---------------------------------------------------------------------------
// Metrics (R11-ADM-01). Targets are PRD §5.2 (hypotheses for the first semester).

/** "42.5%" from a server percent (already rounded); "n/a" when there is no denominator. */
export function formatPct(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return 'n/a';
  const n = Number(v);
  if (!Number.isFinite(n)) return 'n/a';
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
}

/** "5.5 h" from hours; "n/a" when missing. */
export function formatHours(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return 'n/a';
  const n = Number(v);
  if (!Number.isFinite(n)) return 'n/a';
  return `${Number.isInteger(n) ? n : n.toFixed(1)} h`;
}

/** Percent of num over den, one decimal, or null with no denominator (same as private.pct). */
export function pooledRate(num: number, den: number): number | null {
  if (!den) return null;
  return Math.round((1000 * num) / den) / 10;
}

export type Target = { op: 'gte' | 'lt'; value: number };

export const TARGETS = {
  swaps_per_week: { op: 'gte', value: 50 },
  activation: { op: 'gte', value: 40 },
  d7_retention: { op: 'gte', value: 25 },
  hours_to_first_offer: { op: 'lt', value: 6 },
  sell_through_14d: { op: 'gte', value: 30 },
  no_show_rate: { op: 'lt', value: 10 },
  reports_per_100_swaps: { op: 'lt', value: 5 },
  p90_hours_to_resolve: { op: 'lt', value: 24 },
} as const satisfies Record<string, Target>;

/** Whether a value meets its target: 'met', 'missed', or 'none' with no data. */
export function targetStatus(
  value: number | string | null | undefined,
  target: Target,
): 'met' | 'missed' | 'none' {
  if (value === null || value === undefined || value === '') return 'none';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'none';
  const met = target.op === 'gte' ? n >= target.value : n < target.value;
  return met ? 'met' : 'missed';
}

/** "Target ≥ 40%" / "Target < 6 h". */
export function targetLabel(target: Target, unit: '%' | ' h' | ''): string {
  return `Target ${target.op === 'gte' ? '≥' : '<'} ${target.value}${unit}`;
}

/** Bar length as a percent of the largest value (0 when there's nothing to compare). */
export function barPct(value: number | null | undefined, max: number): number {
  if (!value || !max || value <= 0) return 0;
  return Math.min(100, Math.round((value / max) * 1000) / 10);
}

/** "2026-09-28" -> "Sep 28" (dates from the server are calendar days, read as UTC). */
export function dayLabel(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** YYYY-MM-DD for a Date, in UTC. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The default funnel range: the last 28 days ending today (same as the server default). */
export function defaultRange(now: Date): { from: string; to: string } {
  const to = isoDay(now);
  const from = isoDay(new Date(Date.parse(`${to}T00:00:00Z`) - 27 * 86_400_000));
  return { from, to };
}

/** The server takes from <= to and at most 366 days apart. */
export function rangeError(from: string, to: string): string | null {
  const f = Date.parse(`${from}T00:00:00Z`);
  const t = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(f) || Number.isNaN(t)) return 'Pick a start and end date.';
  if (f > t) return 'The start date has to be on or before the end date.';
  if ((t - f) / 86_400_000 > 366) return 'Pick a range of at most a year.';
  return null;
}

/** Monday of the week before the one `today` is in (Postgres date_trunc('week') weeks). */
export function previousWeekStart(today: string): string {
  const t = new Date(`${today.slice(0, 10)}T00:00:00Z`);
  const sinceMonday = (t.getUTCDay() + 6) % 7;
  return isoDay(new Date(t.getTime() - (sinceMonday + 7) * 86_400_000));
}

/** The newest row (rows come newest first) whose field has a value. */
export function latestWith<T extends Record<string, unknown>>(rows: T[], key: keyof T): T | null {
  return rows.find((r) => r[key] !== null && r[key] !== undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Team, announcements, banned words (R11-ADM-02)

/** "12/60", and whether the text is over the limit. Counts code points like Postgres char_length. */
export function charCounter(
  text: string,
  max: number,
): { count: number; over: boolean; label: string } {
  const count = [...text.trim()].length;
  return { count, over: count > max, label: `${count}/${max}` };
}

export const ANNOUNCEMENT_TYPES = [
  { id: 'safety', label: 'Safety' },
  { id: 'news', label: 'News' },
  { id: 'update', label: 'Update' },
] as const;
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number]['id'];

export const ANNOUNCEMENT_TITLE_MAX = 60;
export const ANNOUNCEMENT_BODY_MAX = 200;
export const ANNOUNCEMENT_EVERY_MS = 168 * 3_600_000;

export function announcementFormError(f: {
  campusId: string;
  title: string;
  body: string;
  pinnedHours: number;
  reason: string;
}): string | null {
  if (!f.campusId) return 'Pick a campus.';
  const t = charCounter(f.title, ANNOUNCEMENT_TITLE_MAX);
  if (t.count === 0) return 'Add a title.';
  if (t.over) return `Keep the title to ${ANNOUNCEMENT_TITLE_MAX} characters.`;
  const b = charCounter(f.body, ANNOUNCEMENT_BODY_MAX);
  if (b.count === 0) return 'Add a message.';
  if (b.over) return `Keep the message to ${ANNOUNCEMENT_BODY_MAX} characters.`;
  if (!Number.isInteger(f.pinnedHours) || f.pinnedHours < 0 || f.pinnedHours > 168)
    return 'Pin for 0 to 168 hours.';
  if (f.reason.trim().length < 3) return 'Add a reason of at least 3 characters.';
  return null;
}

/**
 * When the next announcement for a campus is allowed (one per 168 h), or null
 * if one can go out now. Uses the newest announcement's created_at.
 */
export function nextAnnouncementAt(
  rows: { campus_id: string; created_at: string }[],
  campusId: string,
  now: number,
): string | null {
  let latest = -Infinity;
  for (const r of rows) {
    if (r.campus_id !== campusId) continue;
    latest = Math.max(latest, Date.parse(r.created_at));
  }
  if (!Number.isFinite(latest)) return null;
  const next = latest + ANNOUNCEMENT_EVERY_MS;
  return next > now ? new Date(next).toISOString() : null;
}

/** "in 2 days 5 hours", "in 3 hours 10 minutes", "in 4 minutes", "now". */
export function retryIn(iso: string, now: number): string {
  const ms = Date.parse(iso) - now;
  if (Number.isNaN(ms) || ms <= 0) return 'now';
  const mins = Math.ceil(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (d > 0) return `in ${unit(d, 'day')}${h ? ` ${unit(h, 'hour')}` : ''}`;
  if (h > 0) return `in ${unit(h, 'hour')}${m ? ` ${unit(m, 'minute')}` : ''}`;
  return `in ${unit(m, 'minute')}`;
}

export function inviteFormError(f: {
  email: string;
  role: 'owner' | 'moderator';
  campusId: string;
  reason: string;
}): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()))
    return 'Enter the email of their account.';
  if (f.role === 'moderator' && !f.campusId) return 'Pick the campus this moderator covers.';
  if (f.reason.trim().length < 3) return 'Add a reason of at least 3 characters.';
  return null;
}

export const BANNED_SCOPES = [
  { id: 'listing', label: 'Listings' },
  { id: 'quad', label: 'Quad' },
  { id: 'profile', label: 'Profiles' },
  { id: 'offer', label: 'Offer notes' },
  { id: 'rating', label: 'Ratings' },
  { id: 'chat', label: 'Chat' },
  { id: 'chat_on_report', label: 'Chat (on report)' },
] as const;
export type BannedScope = (typeof BANNED_SCOPES)[number]['id'];
export type BannedMatch = 'word' | 'phrase' | 'regex';
export type BannedAction = 'block' | 'review';

/**
 * Client check for a regex pattern before it goes to Postgres. JavaScript and
 * Postgres regex differ a little, so the server check is final; this catches
 * typos and the JS-only syntax Postgres rejects (named groups, flags).
 */
export function regexError(pattern: string): string | null {
  try {
    new RegExp(pattern);
  } catch (e) {
    return `That regex doesn't compile: ${(e as Error).message.replace(/^Invalid regular expression: /, '')}`;
  }
  if (/\(\?<[A-Za-z]/.test(pattern)) return 'Named groups like (?<name>…) are not supported.';
  if (/^\/.*\/[a-z]*$/.test(pattern))
    return 'Leave out the slashes and flags. Text is lowercased before it is checked.';
  return null;
}

export function bannedWordFormError(f: {
  pattern: string;
  match: BannedMatch;
  scopes: string[];
  reason: string;
}): string | null {
  const p = f.pattern.trim();
  const n = [...p].length;
  if (n < 2 || n > 100) return 'Use 2 to 100 characters.';
  if (f.match === 'word' && /\s/.test(p)) return 'A word has no spaces. Pick "phrase" instead.';
  if (f.match === 'regex') {
    const err = regexError(p);
    if (err) return err;
  }
  if (f.scopes.length === 0) return 'Pick at least one place to check.';
  if (f.reason.trim().length < 3) return 'Add a reason of at least 3 characters.';
  return null;
}

/** errorMessage, but with page-specific text for exact codes like "INVALID:email". */
export function knownError(e: unknown, known: Record<string, string>): string {
  const raw = (e as { message?: string })?.message ?? String(e);
  return known[raw] ?? errorMessage(e);
}
