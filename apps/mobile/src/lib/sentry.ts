/**
 * Crash reporting (P1-LIB-02, P14-MON-01; SECURITY §6, ARCHITECTURE §6).
 * `sendDefaultPii: false`, no request bodies, no user fields, 5% traces, network
 * noise ignored, and the F12 switch drops every event. Without
 * `EXPO_PUBLIC_SENTRY_DSN` (local, tests) nothing starts.
 */
import { getStorage } from '@/lib/storage';

type SentryEvent = {
  user?: unknown;
  request?: unknown;
  extra?: Record<string, unknown>;
  breadcrumbs?: { category?: string; data?: Record<string, unknown>; message?: string }[];
  [k: string]: unknown;
};

export const IGNORE_ERRORS = [
  'Network request failed',
  'NETWORK',
  'TypeError: Network request failed',
  'AbortError',
  'The Internet connection appears to be offline',
];

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

/** Strips anything personal before an event leaves the phone; null drops it. */
export function scrubEvent<T extends SentryEvent>(event: T, optedOut: boolean): T | null {
  if (optedOut) return null;
  delete event.user;
  delete event.request;
  delete event.extra;
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      // http breadcrumbs carry URLs with ids and query strings
      .filter((b) => b.category !== 'http' && b.category !== 'fetch' && b.category !== 'xhr')
      .map((b) => ({ ...b, data: undefined, message: b.message?.replace(EMAIL, '[email]') }));
  }
  return event;
}

export function sentryOptions(dsn: string, appEnv: string, release?: string, dist?: string) {
  return {
    dsn,
    environment: appEnv,
    release,
    dist,
    sendDefaultPii: false,
    tracesSampleRate: 0.05,
    attachScreenshot: false,
    attachViewHierarchy: false,
    ignoreErrors: IGNORE_ERRORS,
    beforeSend: (event: SentryEvent) =>
      scrubEvent(event, getStorage().get('privacy.crashOptOut') === true),
    beforeBreadcrumb: (b: { category?: string }) =>
      b.category === 'http' || b.category === 'fetch' || b.category === 'xhr' ? null : b,
  };
}

let started = false;

export function initSentry(
  dsn: string | undefined,
  appEnv: string,
  release?: string,
  dist?: string,
): void {
  if (!dsn || started) return;
  started = true;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sentry = require('@sentry/react-native') as typeof import('@sentry/react-native');
  Sentry.init(
    sentryOptions(dsn, appEnv, release, dist) as unknown as Parameters<typeof Sentry.init>[0],
  );
}

/** The F12 switch. Events already queued are dropped by beforeSend. */
export function setCrashOptOut(out: boolean): void {
  getStorage().set('privacy.crashOptOut', out);
}
