/**
 * PostHog behavior analytics (P1-LIB-02, P14-MON-02; PRD §5.4, SECURITY §6).
 *
 * - Exactly the 18 events below. Properties are small enums or buckets only:
 *   never email, names, message text, prices, titles or ids (T-DATA-01).
 * - `identified_only` profiles keyed by a SHA-256 of the user id; no autocapture,
 *   no session replay, no GeoIP.
 * - The Privacy switch (F12) opts out: nothing is captured and the queue is dropped.
 * - Without `EXPO_PUBLIC_POSTHOG_KEY` (local, tests) every call is a no-op.
 */
import { getStorage } from '@/lib/storage';

export type AnalyticsEvents = {
  app_opened: Record<string, never>;
  signup_started: Record<string, never>;
  email_verified: Record<string, never>;
  onboarding_completed: Record<string, never>;
  card_swiped: { dir: 'left' | 'right' | 'save' };
  listing_viewed: {
    source: 'feed' | 'search' | 'saved' | 'profile' | 'link' | 'notification' | 'other';
  };
  offer_sheet_opened: Record<string, never>;
  offer_sent: { pct_of_ask_bucket: PctBucket };
  search_performed: { results_bucket: CountBucket };
  search_saved: Record<string, never>;
  listing_create_started: Record<string, never>;
  listing_posted: { photos_count: number };
  chat_opened: Record<string, never>;
  meetup_planned: { spot_type: 'meetup_spot' | 'police' | 'custom' };
  deal_confirmed: { outcome: 'done' | 'not_yet' | 'fell_through' };
  rating_submitted: Record<string, never>;
  report_submitted: {
    target_type: 'listing' | 'user' | 'chat' | 'message' | 'quad_post' | 'quad_reply';
  };
  share_tapped: { surface: 'posted' | 'listing' | 'meetup' };
};
export type EventName = keyof AnalyticsEvents;
export const EVENT_NAMES: EventName[] = [
  'app_opened',
  'signup_started',
  'email_verified',
  'onboarding_completed',
  'card_swiped',
  'listing_viewed',
  'offer_sheet_opened',
  'offer_sent',
  'search_performed',
  'search_saved',
  'listing_create_started',
  'listing_posted',
  'chat_opened',
  'meetup_planned',
  'deal_confirmed',
  'rating_submitted',
  'report_submitted',
  'share_tapped',
];

export type PctBucket = '<50' | '50-69' | '70-89' | '90-99' | '100+';
export type CountBucket = '0' | '1-5' | '6-20' | '21+';

/** Offer as a share of the asking price, bucketed so no price leaves the device. */
export function pctBucket(offerCents: number, askCents: number): PctBucket {
  if (askCents <= 0) return '100+';
  const pct = (offerCents / askCents) * 100;
  if (pct < 50) return '<50';
  if (pct < 70) return '50-69';
  if (pct < 90) return '70-89';
  if (pct < 100) return '90-99';
  return '100+';
}

export function countBucket(n: number): CountBucket {
  if (n <= 0) return '0';
  if (n <= 5) return '1-5';
  if (n <= 20) return '6-20';
  return '21+';
}

/** The part of the PostHog client we use (a fake in tests). */
export type AnalyticsClient = {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  identify: (distinctId: string) => void;
  reset: () => void;
  optOut: () => void | Promise<void>;
  optIn: () => void | Promise<void>;
};

// Property values allowed through: short enum strings and small integers.
const SAFE_VALUE = /^[a-z0-9_<>+-]{1,20}$/;

/** Drops anything that isn't a small enum or count, as a last line of defense. */
export function sanitize(
  props: Record<string, unknown> | undefined,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(props ?? {})) {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100) out[k] = v;
    else if (typeof v === 'string' && SAFE_VALUE.test(v)) out[k] = v;
  }
  return out;
}

let client: AnalyticsClient | null = null;

const optedOut = () => getStorage().get('privacy.analyticsOptOut') === true;

export function setAnalyticsClient(c: AnalyticsClient | null): void {
  client = c;
}

export function track<E extends EventName>(
  event: E,
  ...props: AnalyticsEvents[E] extends Record<string, never> ? [] : [AnalyticsEvents[E]]
): void {
  if (!client || optedOut()) return;
  try {
    client.capture(event, sanitize(props[0] as Record<string, unknown> | undefined));
  } catch {
    // analytics must never break the app
  }
}

/** Sign-in: identify by a one-way hash of the user id. */
export async function identify(
  userId: string,
  sha256: (s: string) => Promise<string>,
): Promise<void> {
  if (!client || optedOut()) return;
  try {
    client.identify(await sha256(`onlyswap:${userId}`));
  } catch {
    // ignore
  }
}

export function resetAnalytics(): void {
  try {
    client?.reset();
  } catch {
    // ignore
  }
}

/** The F12 switch: stored on the device first so it applies before the next event. */
export async function setAnalyticsOptOut(out: boolean): Promise<void> {
  getStorage().set('privacy.analyticsOptOut', out);
  try {
    if (out) await client?.optOut();
    else await client?.optIn();
  } catch {
    // ignore
  }
}

/** Creates the real client (native module loaded only here). */
export function initAnalytics(key: string | undefined, host: string | undefined): void {
  if (!key || client) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PostHog } = require('posthog-react-native') as typeof import('posthog-react-native');
  const ph = new PostHog(key, {
    host: host || 'https://us.i.posthog.com',
    personProfiles: 'identified_only',
    captureAppLifecycleEvents: false,
    enableSessionReplay: false,
    disableGeoip: true,
    defaultOptIn: !optedOut(),
  });
  setAnalyticsClient(ph as unknown as AnalyticsClient);
}
