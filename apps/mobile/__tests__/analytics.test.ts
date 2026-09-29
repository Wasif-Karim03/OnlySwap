/**
 * T-DATA-01: PostHog payloads never carry email, names, message text, prices or
 * titles, and the opt-out stops capture. Also the Sentry scrubber (P14-MON-01).
 */
import {
  countBucket,
  EVENT_NAMES,
  identify,
  pctBucket,
  resetAnalytics,
  sanitize,
  setAnalyticsClient,
  setAnalyticsOptOut,
  track,
  type AnalyticsClient,
} from '@/lib/analytics';
import { scrubEvent, sentryOptions } from '@/lib/sentry';
import { getStorage } from '@/lib/storage';

function fakeClient() {
  const captured: { event: string; props?: Record<string, unknown> }[] = [];
  const client: AnalyticsClient & { ids: string[]; resets: number; out: boolean } = {
    ids: [],
    resets: 0,
    out: false,
    capture: (event, props) => void captured.push({ event, props }),
    identify: (id) => void client.ids.push(id),
    reset: () => void (client.resets += 1),
    optOut: () => void (client.out = true),
    optIn: () => void (client.out = false),
  };
  return { client, captured };
}

describe('T-DATA-01 analytics', () => {
  beforeEach(() => {
    getStorage().remove('privacy.analyticsOptOut');
  });
  afterEach(() => setAnalyticsClient(null));

  it('has exactly the 18 PRD events', () => {
    expect(EVENT_NAMES).toHaveLength(18);
    expect(new Set(EVENT_NAMES).size).toBe(18);
  });

  it('is a no-op without a client', () => {
    expect(() => track('app_opened')).not.toThrow();
  });

  it('captures only enums and small counts', () => {
    const { client, captured } = fakeClient();
    setAnalyticsClient(client);
    track('card_swiped', { dir: 'save' });
    track('listing_posted', { photos_count: 4 });
    track('offer_sent', { pct_of_ask_bucket: pctBucket(4000, 5000) });
    // Even if a caller slipped PII in, sanitize drops it.
    (track as (e: string, p: Record<string, unknown>) => void)('report_submitted', {
      target_type: 'listing',
      email: 'kim@osu.edu',
      title: 'Blue lamp for sale',
      body: 'meet me at the library',
      price_cents: 4500,
    });
    expect(captured).toEqual([
      { event: 'card_swiped', props: { dir: 'save' } },
      { event: 'listing_posted', props: { photos_count: 4 } },
      { event: 'offer_sent', props: { pct_of_ask_bucket: '70-89' } },
      { event: 'report_submitted', props: { target_type: 'listing' } },
    ]);
    const json = JSON.stringify(captured);
    expect(json).not.toMatch(/@|lamp|library|4500/);
  });

  it('opt-out stops capture and identify; opt-in resumes', async () => {
    const { client, captured } = fakeClient();
    setAnalyticsClient(client);
    await setAnalyticsOptOut(true);
    track('app_opened');
    await identify('user-1', async (s) => `hash(${s})`);
    expect(captured).toHaveLength(0);
    expect(client.ids).toHaveLength(0);
    expect(client.out).toBe(true);
    await setAnalyticsOptOut(false);
    track('app_opened');
    expect(captured).toHaveLength(1);
  });

  it('identifies with a hash, never the raw id; reset on sign-out', async () => {
    const { client } = fakeClient();
    setAnalyticsClient(client);
    await identify('user-1', async (s) => `sha(${s})`);
    expect(client.ids).toEqual(['sha(onlyswap:user-1)']);
    resetAnalytics();
    expect(client.resets).toBe(1);
  });

  it('buckets', () => {
    expect(pctBucket(1000, 5000)).toBe('<50');
    expect(pctBucket(5000, 5000)).toBe('100+');
    expect(pctBucket(4900, 5000)).toBe('90-99');
    expect(countBucket(0)).toBe('0');
    expect(countBucket(7)).toBe('6-20');
    expect(countBucket(50)).toBe('21+');
    expect(sanitize({ n: 101, s: 'x'.repeat(30), ok: 'a_b' })).toEqual({ ok: 'a_b' });
  });
});

describe('P14-MON-01 Sentry scrubbing', () => {
  it('drops user, request, extra, http breadcrumbs and emails', () => {
    const event = scrubEvent(
      {
        user: { email: 'kim@osu.edu' },
        request: { url: 'x' },
        extra: { body: 'secret' },
        breadcrumbs: [
          { category: 'http', data: { url: 'https://x/rest/v1/rpc?id=1' } },
          { category: 'ui', message: 'typed kim@osu.edu', data: { k: 1 } },
        ],
      },
      false,
    )!;
    expect(event.user).toBeUndefined();
    expect(event.request).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.breadcrumbs).toEqual([
      { category: 'ui', message: 'typed [email]', data: undefined },
    ]);
  });

  it('the crash-report switch drops events', () => {
    expect(scrubEvent({}, true)).toBeNull();
  });

  it('options keep PII off and traces low', () => {
    const o = sentryOptions('https://k@o.ingest.sentry.io/1', 'staging', 'onlyswap@1.0.0+1', '1');
    expect(o.sendDefaultPii).toBe(false);
    expect(o.tracesSampleRate).toBe(0.05);
    expect(o.beforeBreadcrumb({ category: 'fetch' })).toBeNull();
  });
});
