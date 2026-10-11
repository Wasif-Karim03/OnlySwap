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

// ---------------------------------------------------------------------------
// Console v2 (docs/ADMIN_CHECKLIST.md §2 and §3)

const pad2 = (n: number) => String(n).padStart(2, '0');
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** "Today 10:41", "Yesterday 21:02", "Oct 7 14:30" (local time, 24-hour like the mock). */
export function whenLabel(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const t = `${d.getHours()}:${pad2(d.getMinutes())}`;
  const today = new Date(now);
  if (sameDay(d, today)) return `Today ${t}`;
  if (sameDay(d, new Date(now - 86_400_000))) return `Yesterday ${t}`;
  const day = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
  return `${day} ${t}`;
}

/** "Oct 7" (adds the year when it isn't this year). */
export function dateLabel(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() === new Date(now).getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** "12 s ago", "3 min ago", "5 h ago", "Yesterday", "4 days ago", then the date. */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const ms = now - Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.floor(s / 86_400);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return dateLabel(iso, now);
}

/** "+12% vs last week" style change, and whether it went up, down or stayed. */
export function deltaLabel(
  value: number,
  previous: number | null | undefined,
  versus: string,
): { text: string; dir: 'up' | 'down' | 'flat' } {
  if (previous === null || previous === undefined) return { text: '', dir: 'flat' };
  if (previous === 0) {
    if (value === 0) return { text: `Same as ${versus}`, dir: 'flat' };
    return { text: `+${value.toLocaleString('en-US')} vs ${versus}`, dir: 'up' };
  }
  const pct = Math.round(((value - previous) / previous) * 100);
  if (pct === 0) return { text: `Same as ${versus}`, dir: 'flat' };
  return { text: `${pct > 0 ? '+' : ''}${pct}% vs ${versus}`, dir: pct > 0 ? 'up' : 'down' };
}

/** SVG path for a sparkline (oldest first); a flat line for empty or constant series. */
export function sparkPath(points: number[], w: number, h: number): string {
  if (points.length === 0) return `M0 ${h / 2} L${w} ${h / 2}`;
  if (points.length === 1) return `M0 ${h / 2} L${w} ${h / 2}`;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  return points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = max === min ? h / 2 : h - 2 - ((p - min) / span) * (h - 4);
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Bug fix (checklist §2): the Until date is only for Pause and Suspend. */
export function needsUntil(status: string): boolean {
  return status === 'paused' || status === 'suspended';
}

/** Bug fix (checklist §2): the days box is only for Suspend. */
export function needsSuspendDays(action: string): boolean {
  return action === 'suspend';
}

/** Bug fix (checklist §2): changing a student's email needs a school address and a reason. */
export function changeEmailError(email: string, reason: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter the new school email.';
  if (reason.trim().length < 3) return 'Add a reason of at least 3 characters.';
  return null;
}

/** A reason box shared by an action row: 3+ characters, else the message to show. */
export function reasonError(reason: string): string | null {
  return reason.trim().length < 3 ? 'Add a reason of at least 3 characters.' : null;
}

/** Campuses that can get an announcement: every real campus, never the demo one. */
export function announceableCampuses<T extends { is_demo: boolean }>(campuses: T[]): T[] {
  return campuses.filter((c) => !c.is_demo);
}

export const AUDIT_RANGES = [
  { id: '24h', label: 'Last 24 hours', ms: 86_400_000 },
  { id: '7d', label: 'Last 7 days', ms: 7 * 86_400_000 },
  { id: '30d', label: 'Last 30 days', ms: 30 * 86_400_000 },
  { id: 'all', label: 'All time', ms: 0 },
  { id: 'custom', label: 'Pick dates', ms: 0 },
] as const;
export type AuditRange = (typeof AUDIT_RANGES)[number]['id'];

/**
 * Audit log time filter (checklist §2): `since`/`until` ISO times for
 * admin_list_audit_v2. Custom dates are whole local days, `to` included.
 */
export function auditWindow(
  range: AuditRange,
  now: number,
  from?: string,
  to?: string,
): { since?: string; until?: string } {
  const r = AUDIT_RANGES.find((x) => x.id === range);
  if (range === 'custom') {
    const out: { since?: string; until?: string } = {};
    if (from) out.since = new Date(`${from}T00:00:00`).toISOString();
    if (to) out.until = new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000).toISOString();
    return out;
  }
  if (!r || !r.ms) return {};
  return { since: new Date(now - r.ms).toISOString() };
}

/**
 * Keyset paging for lists with a `next_cursor` (audit log): keeps the cursors
 * of the pages before so Previous works. Page 1 has cursor null.
 */
export function pageStack<C>(stack: C[], move: 'next' | 'prev' | 'reset', next?: C | null): C[] {
  if (move === 'reset') return [];
  if (move === 'prev') return stack.slice(0, -1);
  return next === null || next === undefined ? stack : [...stack, next];
}

/** Full URL for a media key (thumbs come back as keys); empty when there's no media host. */
export function mediaUrl(base: string, key: string | null | undefined): string {
  if (!key || !base) return '';
  if (/^https?:\/\//.test(key)) return key;
  return `${base.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
}

/** "$45", "$4.50", "Free" for 0 when asked. */
export function moneyLabel(cents: number | null | undefined, freeWord = false): string {
  if (cents === null || cents === undefined) return '';
  if (cents === 0 && freeWord) return 'Free';
  const d = cents / 100;
  return `$${d.toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

// ---------------------------------------------------------------------------
// Activity page (admin_activity_feed)

export const ACTIVITY_RANGES = [
  { id: 'hour', label: 'Last hour' },
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: 'custom', label: 'Pick dates' },
] as const;
export type ActivityRange = (typeof ACTIVITY_RANGES)[number]['id'];

/** `since`/`until` for a time preset. Today starts at local midnight; custom days are whole local days. */
export function activityWindow(
  range: ActivityRange,
  now: number,
  from?: string,
  to?: string,
): { since: string | null; until: string | null } {
  if (range === 'hour') return { since: new Date(now - 3_600_000).toISOString(), until: null };
  if (range === '7d') return { since: new Date(now - 7 * 86_400_000).toISOString(), until: null };
  if (range === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return { since: d.toISOString(), until: null };
  }
  return {
    since: from ? new Date(`${from}T00:00:00`).toISOString() : null,
    until: to ? new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000).toISOString() : null,
  };
}

/** Picked kinds to the RPC's `kinds`: none picked means null (everything except deck cards). */
export function kindsArg(picked: readonly string[]): string[] | null {
  return picked.length ? [...new Set(picked)] : null;
}

/** Chip text for the type filter: "All", whole group names, or "5 types". */
export function kindsSummary(
  picked: readonly string[],
  groups: readonly { label: string; kinds: readonly string[] }[],
): string {
  if (!picked.length) return 'All';
  const set = new Set(picked);
  const whole = groups.filter((g) => g.kinds.every((k) => set.has(k)));
  const covered = new Set(whole.flatMap((g) => g.kinds));
  if (whole.length && picked.every((k) => covered.has(k)))
    return whole.length <= 2 ? whole.map((g) => g.label).join(', ') : `${whole.length} groups`;
  return set.size === 1 ? '1 type' : `${set.size} types`;
}

/** Toggle a whole group: adds every kind, or removes them when all are on. */
export function toggleGroup(picked: readonly string[], kinds: readonly string[]): string[] {
  const set = new Set(picked);
  const allOn = kinds.every((k) => set.has(k));
  for (const k of kinds) {
    if (allOn) set.delete(k);
    else set.add(k);
  }
  return [...set];
}

export function toggleItem<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/** Arguments for admin_activity_feed from the page filters. */
export function activityArgs(f: {
  campusId: string | null;
  kinds: readonly string[];
  userId: string | null;
  listingId: string | null;
  range: ActivityRange;
  from?: string;
  to?: string;
  now: number;
  cursor?: { at: string; id: string } | null;
  limit?: number;
}): Record<string, unknown> {
  const w = activityWindow(f.range, f.now, f.from, f.to);
  return {
    campus_id: f.campusId || null,
    kinds: kindsArg(f.kinds),
    user_id: f.userId || null,
    listing_id: f.listingId || null,
    since: w.since,
    until: w.until,
    cursor: f.cursor ?? null,
    limit: f.limit ?? 50,
  };
}

/** "Load more" for keyset pages: appends, skipping ids already shown. */
export function appendPage<T extends { id: string | number }>(shown: T[], next: T[]): T[] {
  const seen = new Set(shown.map((x) => x.id));
  return [...shown, ...next.filter((x) => !seen.has(x.id))];
}

// ---------------------------------------------------------------------------
// Listing page (admin_listing_activity)

export type FunnelIn = {
  shown: number;
  viewed: number;
  saved: number;
  offered: number;
  sold: boolean;
};

/** Funnel bars: width relative to the biggest step, a sliver for zero like the mock. */
export function funnelRows(f: FunnelIn): { label: string; value: number; pct: number }[] {
  const rows = [
    { label: 'Shown in deck', value: f.shown },
    { label: 'Viewed details', value: f.viewed },
    { label: 'Saved', value: f.saved },
    { label: 'Offered', value: f.offered },
    { label: 'Sold', value: f.sold ? 1 : 0 },
  ];
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows.map((r) => ({
    ...r,
    pct: r.value ? Math.max(2, Math.round((r.value / max) * 100)) : 1,
  }));
}

/** Right (saved or offered) against left, as whole percents that add to 100. */
export function rightLeft(s: { right: number; left: number }): { right: number; left: number } {
  const total = s.right + s.left;
  if (!total) return { right: 0, left: 0 };
  const right = Math.round((s.right / total) * 100);
  return { right, left: 100 - right };
}

/**
 * The comparison line under Right vs left, only from what the server gives:
 * "Similar bikes at Ohio Wesleyan get 31% right swipes." plus a second line
 * when this listing is clearly above or below (10+ points, 20+ category swipes).
 */
export function comparisonText(
  c: {
    right_rate: number | null;
    category_right_rate: number | null;
    category_swipes: number;
  } | null,
  category: string | null | undefined,
  campus: string | null | undefined,
): { line: string; hint: string | null } | null {
  if (!c || c.category_right_rate === null || c.category_right_rate === undefined) return null;
  const what = category ? `Similar ${category.toLowerCase()}` : 'Similar listings';
  const where = campus ? ` at ${campus}` : '';
  const line = `${what}${where} get ${fmtRate(c.category_right_rate)} right swipes.`;
  let hint: string | null = null;
  if (c.right_rate !== null && c.right_rate !== undefined && c.category_swipes >= 20) {
    const diff = c.right_rate - c.category_right_rate;
    if (diff <= -10) hint = `This one gets ${fmtRate(c.right_rate)}, well below that.`;
    else if (diff >= 10) hint = `This one gets ${fmtRate(c.right_rate)}, well above that.`;
  }
  return { line, hint };
}

function fmtRate(v: number): string {
  return `${Math.round(v * 10) / 10}%`.replace('.0%', '%');
}

export const SWIPE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'offered', label: 'Offered' },
  { id: 'saved', label: 'Saved' },
  { id: 'left', label: 'Left' },
] as const;
export type SwipeFilter = (typeof SWIPE_FILTERS)[number]['id'];

/** Who swiped, filtered, plus the counts for the segmented control. */
export function swipeCounts<T extends { direction: string }>(
  rows: T[],
): Record<SwipeFilter, number> {
  const n = (d: string) => rows.filter((r) => r.direction === d).length;
  return { all: rows.length, offered: n('offered'), saved: n('saved'), left: n('left') };
}

// ---------------------------------------------------------------------------
// Student page (admin_person)

export const PERSON_TABS = [
  'timeline',
  'offers',
  'listings',
  'chats',
  'meetups',
  'reports',
  'blocks',
  'access',
] as const;
export type PersonTab = (typeof PERSON_TABS)[number];

/** Tab from the URL (?tab=offers); anything else is the timeline. */
export function personTab(v: unknown): PersonTab {
  return (PERSON_TABS as readonly string[]).includes(String(v)) ? (v as PersonTab) : 'timeline';
}

export const TIMELINE_FILTERS = [
  { id: 'all', label: 'All', kinds: null },
  {
    id: 'offers',
    label: 'Offers',
    kinds: ['offer_made', 'offer_countered', 'offer_accepted', 'offer_declined', 'deal_done'],
  },
  { id: 'saves', label: 'Saves', kinds: ['saved', 'unsaved'] },
  { id: 'left', label: 'Left', kinds: ['swiped_left'] },
  { id: 'views', label: 'Views', kinds: ['listing_viewed', 'opened_from', 'searched'] },
] as const;
export type TimelineFilter = (typeof TIMELINE_FILTERS)[number]['id'];

/** Timeline kinds: an explicit type pick wins over the segmented filter. */
export function timelineKinds(seg: TimelineFilter, picked: readonly string[]): string[] | null {
  if (picked.length) return [...picked];
  const f = TIMELINE_FILTERS.find((x) => x.id === seg);
  return f?.kinds ? [...f.kinds] : null;
}

/** 24 heat-strip opacities (0.06 to 1) from hourly counts, like the mock. */
export function heatLevels(hourly: readonly number[]): number[] {
  const h = Array.from({ length: 24 }, (_, i) => Number(hourly[i]) || 0);
  const max = Math.max(...h);
  return h.map((v) => (max ? Math.round((0.06 + (v / max) * 0.94) * 100) / 100 : 0.06));
}

/** Busiest hours as words: "Most active 8 pm to 10 pm". */
export function peakHours(hourly: readonly number[]): string {
  const h = Array.from({ length: 24 }, (_, i) => Number(hourly[i]) || 0);
  const max = Math.max(...h);
  if (!max) return 'No activity in the last 30 days';
  let best = 0;
  let bestSum = -1;
  for (let i = 0; i < 24; i++) {
    const s = h[i]! + h[(i + 1) % 24]!;
    if (s > bestSum) {
      bestSum = s;
      best = i;
    }
  }
  return `Most active ${hourLabel(best)} to ${hourLabel((best + 2) % 24)}`;
}

export function hourLabel(h: number): string {
  const n = ((h % 24) + 24) % 24;
  if (n === 0) return '12 am';
  if (n === 12) return '12 pm';
  return n < 12 ? `${n} am` : `${n - 12} pm`;
}

/** "100% up" or "No ratings yet". */
export function ratingLabel(r: { up: number; down: number } | null | undefined): string {
  const total = (r?.up ?? 0) + (r?.down ?? 0);
  if (!r || !total) return 'No ratings';
  return `${Math.round((r.up / total) * 100)}% up`;
}

// ---------------------------------------------------------------------------
// Schools (Add school, waitlist)

/** "Ohio Wesleyan University" -> "ohio-wesleyan-university" (2 to 40 of a-z, 0-9, -). */
export function slugFromName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

/** US school time zones for the Add school form (any IANA zone works on the server). */
export const TIME_ZONES = [
  { id: 'America/New_York', label: 'Eastern (New York)' },
  { id: 'America/Chicago', label: 'Central (Chicago)' },
  { id: 'America/Denver', label: 'Mountain (Denver)' },
  { id: 'America/Phoenix', label: 'Arizona (Phoenix)' },
  { id: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { id: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { id: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
] as const;

export type NewCampusForm = {
  name: string;
  short_name: string;
  slug: string;
  timezone: string;
  domain: string;
  status: 'live' | 'waitlist';
  spot_name: string;
  spot_description: string;
  spot_hours: string;
  spot_lat: string;
  spot_lng: string;
  reason: string;
};

/** First problem with the Add school form, or null (matches admin_create_campus checks). */
export function newCampusError(f: NewCampusForm): string | null {
  const name = f.name.trim();
  if (name.length < 3 || name.length > 100) return 'Enter the school name (3 to 100 characters).';
  const short = f.short_name.trim();
  if (short.length < 2 || short.length > 40) return 'Enter a short name (2 to 40 characters).';
  if (!/^[a-z0-9-]{2,40}$/.test(f.slug)) return 'The link name can use a to z, 0 to 9 and dashes.';
  if (!f.timezone) return 'Pick a time zone.';
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(f.domain.trim().toLowerCase().replace(/^@/, '')))
    return 'Enter the student email domain, like owu.edu.';
  const anySpot = [f.spot_name, f.spot_lat, f.spot_lng].some((v) => v.trim());
  if (anySpot) {
    if (f.spot_name.trim().length < 2)
      return 'Name the first Meetup spot, or leave the spot empty.';
    const lat = Number(f.spot_lat);
    const lng = Number(f.spot_lng);
    if (!f.spot_lat.trim() || !Number.isFinite(lat) || lat < -90 || lat > 90)
      return 'Enter the spot latitude (-90 to 90).';
    if (!f.spot_lng.trim() || !Number.isFinite(lng) || lng < -180 || lng > 180)
      return 'Enter the spot longitude (-180 to 180).';
  }
  return reasonError(f.reason);
}

/** admin_create_campus arguments from the form. */
export function newCampusArgs(f: NewCampusForm): Record<string, unknown> {
  const spot = f.spot_name.trim()
    ? {
        name: f.spot_name.trim(),
        lat: Number(f.spot_lat),
        lng: Number(f.spot_lng),
        ...(f.spot_description.trim() ? { description: f.spot_description.trim() } : {}),
        ...(f.spot_hours.trim() ? { hours: f.spot_hours.trim() } : {}),
      }
    : null;
  return {
    name: f.name.trim(),
    short_name: f.short_name.trim(),
    slug: f.slug,
    timezone: f.timezone,
    domain: f.domain.trim().toLowerCase().replace(/^@/, ''),
    status: f.status,
    spot,
    reason: f.reason.trim(),
  };
}

/** Waitlist progress toward the campus threshold, 0 to 100. */
export function thresholdPct(n: number, threshold: number | null | undefined): number {
  if (!threshold || threshold <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((n / threshold) * 100)));
}

// ---------------------------------------------------------------------------
// Bulk listing actions, support, system health

export const BULK_MAX = 200;

/** "Held 4. 1 skipped (already removed or not allowed)." */
export function bulkResultText(
  status: 'held_review' | 'removed' | 'active',
  r: { changed: number; skipped_ids?: unknown[] | null },
): string {
  const verb = status === 'removed' ? 'Removed' : status === 'held_review' ? 'Held' : 'Approved';
  const skipped = r.skipped_ids?.length ?? 0;
  return `${verb} ${r.changed}.${skipped ? ` ${skipped} skipped (already in that state or can't change).` : ''}`;
}

/** The one line under the reply box: who gets the email and from where. */
export function supportEmailLine(email: string | null | undefined): string {
  return email
    ? `Sends an email to ${email} from the OnlySwap support address.`
    : 'This request has no email address, so a reply cannot be sent.';
}

/** "182 MB", "1.2 GB", "640 KB". */
export function bytesLabel(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10} ${units[i]}`;
}

/** Run time of a scheduled job: "120 ms", "2.4 s", "3 min". */
export function durationLabel(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start || !end) return '';
  const ms = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${Math.round(ms / 100) / 10} s`;
  return `${Math.round(ms / 60_000)} min`;
}

/** Plain cron schedule for the common shapes, else the raw schedule. */
export function cronLabel(s: string): string {
  const t = s.trim();
  if (t === '* * * * *') return 'Every minute';
  let m = /^\*\/(\d+) \* \* \* \*$/.exec(t);
  if (m) return `Every ${m[1]} min`;
  m = /^(\d+) \* \* \* \*$/.exec(t);
  if (m) return 'Every hour';
  m = /^(\d+) (\d+) \* \* \*$/.exec(t);
  if (m) return `Daily ${m[2]!.padStart(2, '0')}:${m[1]!.padStart(2, '0')} UTC`;
  return t;
}

/** Rows for the Activity CSV (the loaded rows only). */
export function activityCsvRows(
  items: {
    at: string;
    kind: string;
    person: { id: string; display_name: string | null } | null;
    listing: { id: string; title: string } | null;
    platform: string | null;
    details: Record<string, unknown> | null;
  }[],
  detailText: (kind: string, d: Record<string, unknown> | null) => string,
): Record<string, unknown>[] {
  return items.map((e) => ({
    time: e.at,
    student_id: e.person?.id ?? '',
    student: e.person?.display_name ?? 'Deleted account',
    action: e.kind,
    listing_id: e.listing?.id ?? '',
    listing: e.listing?.title ?? '',
    details: detailText(e.kind, e.details),
    device: e.platform ?? '',
  }));
}
export const ACTIVITY_CSV_COLS = [
  'time',
  'student_id',
  'student',
  'action',
  'listing_id',
  'listing',
  'details',
  'device',
];

// ---------------------------------------------------------------------------
// Staging tools

/** PostgREST's answer for a function that doesn't exist on this server (PGRST202, HTTP 404). */
export function isMissingFunction(message: string | null | undefined): boolean {
  if (!message) return false;
  return /PGRST202|could not find the function/i.test(message);
}

export type BotState = 'running' | 'late' | 'failing' | 'paused' | 'not_scheduled' | 'not_run';

/**
 * The mock seller bot at a glance: not scheduled, paused, its last run failed,
 * no run for over 5 minutes (it runs every minute), or running.
 */
export function mockBotState(
  bot: {
    active: boolean;
    last_run: { status: string; start_time: string | null } | null;
  } | null,
  now: number = Date.now(),
): BotState {
  if (!bot) return 'not_scheduled';
  if (!bot.active) return 'paused';
  if (!bot.last_run?.start_time) return 'not_run';
  if (bot.last_run.status === 'failed') return 'failing';
  const age = now - Date.parse(bot.last_run.start_time);
  return Number.isNaN(age) || age > 5 * 60_000 ? 'late' : 'running';
}
