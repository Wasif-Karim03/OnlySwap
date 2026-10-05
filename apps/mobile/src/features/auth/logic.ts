/**
 * Pure auth logic: email parsing, name rules and the launch gate
 * (P4-AUTH-02; T-UNIT-AUTH-01, 02, 03, 06). No React, no network.
 */

/** Consumer email providers. These never reach `lookup_school` (T-UNIT-AUTH-02). */
export const PERSONAL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'mail.com',
  'zoho.com',
  'yandex.com',
  'hey.com',
  'fastmail.com',
]);

const EMAIL = /^[^@\s]+@([^@\s]+\.[^@\s]+)$/;

/** Lowercased, trimmed address, or null when it isn't an email. */
export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return EMAIL.test(email) ? email : null;
}

/** The domain part of a valid address, lowercased and trimmed. */
export function emailDomain(input: string): string | null {
  const email = normalizeEmail(input);
  return email ? email.slice(email.indexOf('@') + 1) : null;
}

export function isPersonalDomain(domain: string): boolean {
  return PERSONAL_DOMAINS.has(domain.trim().toLowerCase());
}

/**
 * First names: letters in any script, spaces, hyphens and apostrophes,
 * starting and ending with a letter, 1 to 30 characters. Mirrors
 * `update_profile` (0012) so the form and the server agree (T-UNIT-AUTH-01).
 */
export function validateName(input: string): 'ok' | 'empty' | 'too_long' | 'invalid' {
  const name = input.trim();
  if (name.length === 0) return 'empty';
  if ([...name].length > 30) return 'too_long';
  return /^\p{L}(?:[\p{L}\p{M} '’-]*[\p{L}\p{M}])?$/u.test(name) ? 'ok' : 'invalid';
}

/** The one letter shown after the first name, from whatever was typed as the last name. */
export function lastInitialOf(input: string): string | null {
  const first = [...input.trim()][0];
  return first && /\p{L}/u.test(first) ? first.toLocaleUpperCase() : null;
}

/** How the name appears to other students: "Wasif K." or just "Wasif". */
export function shownAs(firstName: string, lastName: string): string {
  const first = firstName.trim();
  const initial = lastInitialOf(lastName);
  return initial ? `${first} ${initial}.` : first;
}

/** Compares dotted versions numerically: -1, 0 or 1. Missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Launch gate (A01, T-UNIT-AUTH-03)

export type AppConfig = {
  maintenance: { enabled: boolean; until: string | null };
  minVersionIos: string;
  minVersionAndroid: string;
  rulesVersion: string;
  /** "What changed" lines for the Updated rules screen (D10, DEC 52). */
  rulesChanges: string[];
  /** Photos in chat (P8-CHAT-04, R11-PHOTO-GATE). Off unless the server says true. */
  chatPhotosEnabled: boolean;
};

export type GateProfile = {
  status: 'active' | 'waitlist' | 'reverify' | 'paused' | 'suspended' | 'banned';
  firstName: string | null;
  adultConfirmed: boolean;
  rulesVersion: string | null;
  /** YYYY-MM-DD; the yearly student check is due after this day (X9). */
  verifiedUntil?: string | null;
  /** A10: your campus opened after you joined and you haven't seen it yet (show once). */
  showUnlocked?: boolean;
};

export type GateInput = {
  /** `undefined` while loading; `null` when it couldn't be fetched (checks are skipped). */
  config: AppConfig | null | undefined;
  appVersion: string;
  platform: 'ios' | 'android';
  session: 'loading' | 'signedOut' | 'signedIn';
  /** `undefined` while loading; `null` when the signed-in user has no profile row. */
  profile: GateProfile | null | undefined;
  notificationsAsked: boolean;
  /** Today as YYYY-MM-DD (device date; the server enforces the campus date). */
  today?: string;
};

export type GateRoute =
  | 'maintenance'
  | 'update'
  | 'welcome'
  | 'account-status'
  | 'reverify'
  | 'age'
  | 'profile-setup'
  | 'rules'
  | 'rules-updated'
  | 'waitlist'
  | 'unlocked'
  | 'notifications'
  | 'home';

/** Where each gate route lives in Expo Router. */
export const GATE_HREF = {
  maintenance: '/maintenance',
  update: '/update',
  welcome: '/welcome',
  'account-status': '/account-status',
  reverify: '/reverify',
  age: '/age',
  'profile-setup': '/profile-setup',
  rules: '/rules',
  'rules-updated': '/rules?updated=1',
  waitlist: '/waitlist',
  unlocked: '/unlocked',
  // Not /notifications: that path is the notification list (F09).
  notifications: '/allow-notifications',
  home: '/discover',
} as const satisfies Record<GateRoute, string>;

/**
 * The one place that decides where the app opens. Order matters: system
 * states first, then the session, then account status, then onboarding steps.
 * Returns null while something it needs is still loading.
 */
export function computeGate(input: GateInput): GateRoute | null {
  const { config, session, profile } = input;
  if (session === 'loading' || config === undefined) return null;

  if (config) {
    if (config.maintenance.enabled) return 'maintenance';
    const min = input.platform === 'ios' ? config.minVersionIos : config.minVersionAndroid;
    if (compareVersions(input.appVersion, min) < 0) return 'update';
  }

  if (session === 'signedOut') return 'welcome';
  if (profile === undefined) return null;
  if (profile === null) return 'welcome';

  if (
    profile.status === 'banned' ||
    profile.status === 'suspended' ||
    profile.status === 'paused'
  ) {
    return 'account-status';
  }
  if (profile.status === 'reverify') return 'reverify';
  // Overdue before the nightly job flips the status: same screen.
  if (profile.verifiedUntil && input.today && profile.verifiedUntil < input.today)
    return 'reverify';
  if (!profile.adultConfirmed) return 'age';
  if (!profile.firstName) return 'profile-setup';
  if (profile.rulesVersion === null) return 'rules';
  if (config && profile.rulesVersion !== config.rulesVersion) return 'rules-updated';
  if (profile.status === 'waitlist') return 'waitlist';
  if (profile.status === 'active' && profile.showUnlocked) return 'unlocked';
  if (!input.notificationsAsked) return 'notifications';
  return 'home';
}

/**
 * A10 once (P4-AUTH-13): same rule as my_waitlist_position().show_unlocked,
 * from the profile row and its campus so launch needs no extra call.
 */
export function shouldShowUnlocked(row: {
  created_at?: string | null;
  seen_unlock_at?: string | null;
  campus?: { status?: string | null; unlocked_at?: string | null } | null;
}): boolean {
  const opened = row.campus?.unlocked_at ? Date.parse(row.campus.unlocked_at) : NaN;
  const joined = row.created_at ? Date.parse(row.created_at) : NaN;
  return (
    row.campus?.status === 'live' &&
    !Number.isNaN(opened) &&
    !Number.isNaN(joined) &&
    joined < opened &&
    !row.seen_unlock_at
  );
}

/** A local calendar date as YYYY-MM-DD. */
export function localDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses `get_app_config` output. Anything malformed falls back to safe defaults. */
export function parseAppConfig(raw: unknown): AppConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const m = (r.maintenance && typeof r.maintenance === 'object' ? r.maintenance : {}) as Record<
    string,
    unknown
  >;
  const str = (v: unknown, fallback: string) => (typeof v === 'string' && v ? v : fallback);
  return {
    maintenance: {
      enabled: m.enabled === true,
      until: typeof m.until === 'string' ? m.until : null,
    },
    minVersionIos: str(r.min_version_ios, '0'),
    minVersionAndroid: str(r.min_version_android, '0'),
    rulesVersion: str(r.rules_version, ''),
    rulesChanges: Array.isArray(r.rules_changes)
      ? r.rules_changes.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      : [],
    chatPhotosEnabled: r.chat_photos_enabled === true,
  };
}
