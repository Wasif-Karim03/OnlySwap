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
};

export type GateProfile = {
  status: 'active' | 'waitlist' | 'reverify' | 'paused' | 'suspended' | 'banned';
  firstName: string | null;
  adultConfirmed: boolean;
  rulesVersion: string | null;
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
  notifications: '/notifications',
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
  if (!profile.adultConfirmed) return 'age';
  if (!profile.firstName) return 'profile-setup';
  if (profile.rulesVersion === null) return 'rules';
  if (config && profile.rulesVersion !== config.rulesVersion) return 'rules-updated';
  if (profile.status === 'waitlist') return 'waitlist';
  if (!input.notificationsAsked) return 'notifications';
  return 'home';
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
  };
}
