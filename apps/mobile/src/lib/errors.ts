import { errors as errorStrings } from '@/strings/en';

/**
 * Error codes (API §0) plus client-only codes. Server codes arrive as the
 * Postgres exception message of SQLSTATE P0001, optionally with `:` params.
 */
export const SERVER_ERROR_CODES = [
  'NOT_AUTHENTICATED',
  'NOT_ACTIVE',
  'AGE_REQUIRED',
  'RULES_REQUIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INVALID',
  'BANNED_TERM',
  'RATE_LIMITED',
  'OFFERS_PAUSED',
  'LISTING_UNAVAILABLE',
  'OFFER_NOT_PENDING',
  'ALREADY_REPORTED',
  'ALREADY_APPEALED',
  'MEETUP_WINDOW',
  'CHAT_CLOSED',
  'CHAT_BLOCKED',
  'NOT_ADMIN',
  'SCHOOL_UNKNOWN',
  'DOMAIN_BLOCKED',
  'AGE_BLOCKED',
  'BANNED',
  'FEATURE_OFF',
] as const;

export const CLIENT_ERROR_CODES = ['ERR_OFFLINE', 'SESSION_EXPIRED', 'UNKNOWN'] as const;

export type ServerErrorCode = (typeof SERVER_ERROR_CODES)[number];
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];
export type ErrorCode = ServerErrorCode | ClientErrorCode;

export const ERROR_CODES: readonly ErrorCode[] = [...SERVER_ERROR_CODES, ...CLIENT_ERROR_CODES];

export type AppError = {
  kind: 'app_error';
  code: ErrorCode;
  /** `NOT_ACTIVE:<status>`, `INVALID:<field>`, `BANNED_TERM:<term>` */
  detail?: string;
  /** `RATE_LIMITED:<action>:<retry_at>` */
  action?: string;
  retryAt?: Date;
  /** Original message, for logs only (never shown to users). */
  raw?: string;
};

const serverCodes = new Set<string>(SERVER_ERROR_CODES);

export function isAppError(value: unknown): value is AppError {
  return typeof value === 'object' && value !== null && (value as AppError).kind === 'app_error';
}

function make(code: ErrorCode, extra: Partial<AppError> = {}): AppError {
  return { kind: 'app_error', code, ...extra };
}

/** Parses a P0001 message such as `RATE_LIMITED:offer:2026-09-26T18:00:00Z`. */
export function parseServerMessage(message: string): AppError | undefined {
  const [head, ...rest] = message.trim().split(':');
  if (!head || !serverCodes.has(head)) return undefined;
  const code = head as ServerErrorCode;
  if (code === 'RATE_LIMITED') {
    const [action, ...timeParts] = rest;
    const iso = timeParts.join(':');
    const retryAt = iso ? new Date(iso) : undefined;
    return make(code, {
      action: action || undefined,
      retryAt: retryAt && !Number.isNaN(retryAt.getTime()) ? retryAt : undefined,
      raw: message,
    });
  }
  const detail = rest.join(':');
  return make(code, { detail: detail || undefined, raw: message });
}

type ErrorLike = {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  name?: unknown;
};

const OFFLINE_PATTERNS = [
  /network request failed/i,
  /failed to fetch/i,
  /network ?error/i,
  /timeout/i,
];

/**
 * Normalizes anything thrown by supabase-js, fetch or our own code into an
 * AppError (T-UNIT-LIB-01). Never throws.
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  const e = (typeof error === 'object' && error !== null ? error : {}) as ErrorLike;
  const message =
    typeof e.message === 'string' ? e.message : typeof error === 'string' ? error : '';

  if (e.code === 'P0001' && message) {
    return parseServerMessage(message) ?? make('UNKNOWN', { raw: message });
  }
  const status = typeof e.status === 'number' ? e.status : undefined;
  if (status === 401 || e.code === 'PGRST301' || /jwt expired/i.test(message)) {
    return make('SESSION_EXPIRED', { raw: message });
  }
  if (
    e.name === 'TypeError' ||
    e.name === 'AbortError' ||
    OFFLINE_PATTERNS.some((re) => re.test(message))
  ) {
    if (!status) return make('ERR_OFFLINE', { raw: message });
  }
  if (message) {
    const parsed = parseServerMessage(message);
    if (parsed) return parsed;
  }
  return make('UNKNOWN', { raw: message || undefined });
}

export type CopyOptions = {
  /** IANA zone of the user's campus, e.g. `America/New_York`. */
  campusTimeZone: string;
  locale?: string;
};

/** Formats a retry time in the campus time zone, e.g. "6:00 PM". */
export function formatRetryTime(
  date: Date,
  { campusTimeZone, locale = 'en-US' }: CopyOptions,
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: campusTimeZone,
  }).format(date);
}

/** User-facing copy for an error (T-UNIT-LIB-02). Strings live in en.ts. */
export function errorCopy(error: AppError, options: CopyOptions): string {
  if (error.code === 'RATE_LIMITED') {
    return error.retryAt
      ? errorStrings.RATE_LIMITED_UNTIL.replace('{time}', formatRetryTime(error.retryAt, options))
      : errorStrings.RATE_LIMITED;
  }
  return errorStrings[error.code];
}

/** The device zone, until the campus zone is loaded with the profile. */
export const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Shortcut: user-facing copy for any thrown value. */
export function errorText(error: unknown, campusTimeZone: string = deviceTz()): string {
  return errorCopy(toAppError(error), { campusTimeZone });
}
