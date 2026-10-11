/**
 * Activity events for the admin console (DEC 93, ADMIN_CHECKLIST §4; API
 * `track_events`). Cards shown in the deck, listing views with time on page
 * and where they were opened from, searches, app opens, and the skip, save
 * and offer taps with time on card.
 *
 * - Service data, not analytics: it goes only to our database through
 *   `track_events`, never to PostHog, and the privacy policy lists it as used
 *   "to run and protect the service". So the analytics opt-out (F12) does not
 *   turn it off; signing out does (the queue is cleared).
 * - Queued on the device (app storage `activity.queue`, owned by the signed-in
 *   user) and sent in batches of up to 50: every 15 s, when the app goes to
 *   the background and when 50 are waiting. At most 100 batches an hour leave
 *   the device (the server allows 120). Events older than 24 h are dropped
 *   (the server would clamp them) and the queue keeps the newest 500.
 * - Network and rate-limit failures back off and retry; a batch the server
 *   rejects for any other reason is dropped. Nothing here throws into the UI.
 * - Off under Jest unless a test installs its own queue (`setActivityQueue`).
 */
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import { toAppError } from './errors';
import { createRpc, type RpcClient } from './rpc';
import { getStorage } from './storage';
import { getSupabase } from './supabase';

export const ACTIVITY_KINDS = [
  'app_open',
  'deck_shown',
  'listing_viewed',
  'swiped_left',
  'saved',
  'unsaved',
  'offer_made',
  'searched',
  'opened_from',
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Where a listing was opened from (server enum; anything else is sent as no source). */
export const ACTIVITY_SOURCES = [
  'discover',
  'search',
  'campus',
  'profile',
  'saved',
  'link',
  'notification',
] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

/** Kinds the server only keeps with a listing on the caller's campus. */
const LISTING_KINDS = new Set<ActivityKind>([
  'deck_shown',
  'listing_viewed',
  'swiped_left',
  'saved',
  'unsaved',
  'offer_made',
  'opened_from',
]);

export const BATCH_MAX = 50;
export const QUEUE_MAX = 500;
export const MAX_AGE_MS = 24 * 3600_000;
export const FLUSH_MS = 15_000;
/** Client budget per rolling hour; the server limit is 120. */
export const HOURLY_MAX = 100;
export const DWELL_MAX = 600_000;
export const QUERY_MAX = 80;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 300_000;

export type ActivityOptions = {
  listingId?: string;
  source?: ActivitySource;
  dwellMs?: number;
  query?: string;
  /** When it happened, if not now (a listing view is stamped when it opened). */
  at?: Date;
};

/** One item of `track_events.events`, exactly as the server reads it. */
export type ActivityEvent = {
  kind: ActivityKind;
  listing_id?: string;
  source?: ActivitySource;
  dwell_ms?: number;
  query?: string;
  at: string;
};

export type TrackEventsArgs = {
  events: ActivityEvent[];
  platform: 'ios' | 'android' | 'web' | null;
  app_version: string | null;
};

/** What is kept in app storage between launches. */
export type PersistedQueue = { owner: string; events: ActivityEvent[] };

export type ActivityQueueDeps = {
  send: (args: TrackEventsArgs) => Promise<unknown>;
  load: () => unknown;
  save: (q: PersistedQueue | null) => void;
  platform: string | null;
  appVersion: string | null;
  now?: () => number;
};

export type ActivityQueue = {
  /** Signed in: load this user's saved events and start the 15 s timer. */
  start: (userId: string) => void;
  /** Signed out: forget everything, including the saved queue. */
  stop: () => void;
  track: (kind: ActivityKind, opts?: ActivityOptions) => void;
  flush: () => Promise<void>;
  pending: () => ActivityEvent[];
  userId: () => string | null;
};

export function isSource(v: unknown): v is ActivitySource {
  return typeof v === 'string' && (ACTIVITY_SOURCES as readonly string[]).includes(v);
}

/** A route param (`from`) as a source, or undefined. */
export function toSource(v: unknown): ActivitySource | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return isSource(s) ? s : undefined;
}

export function toPlatform(os: string | null | undefined): TrackEventsArgs['platform'] {
  return os === 'ios' || os === 'android' || os === 'web' ? os : null;
}

/** The server keeps versions matching `^[0-9A-Za-z.+-]{1,20}$`. */
export function toAppVersion(v: string | null | undefined): string | null {
  return v && /^[0-9A-Za-z.+-]{1,20}$/.test(v) ? v : null;
}

/** Builds the event the server expects, or null when the server would drop it. */
export function makeEvent(
  kind: ActivityKind,
  opts: ActivityOptions,
  nowMs: number,
): ActivityEvent | null {
  if (!(ACTIVITY_KINDS as readonly string[]).includes(kind)) return null;
  const ev: ActivityEvent = { kind, at: new Date(opts.at?.getTime() ?? nowMs).toISOString() };
  if (LISTING_KINDS.has(kind)) {
    if (!opts.listingId) return null;
    ev.listing_id = opts.listingId;
  }
  if (isSource(opts.source)) ev.source = opts.source;
  if (typeof opts.dwellMs === 'number' && Number.isFinite(opts.dwellMs) && opts.dwellMs >= 0) {
    ev.dwell_ms = Math.min(Math.round(opts.dwellMs), DWELL_MAX);
  }
  if (kind === 'searched') {
    const q = (opts.query ?? '').replace(/\s+/g, ' ').trim().slice(0, QUERY_MAX);
    if (!q) return null;
    ev.query = q;
  }
  return ev;
}

/** Drops events older than 24 h (or malformed) and keeps the newest QUEUE_MAX. */
export function prune(events: ActivityEvent[], nowMs: number): ActivityEvent[] {
  const fresh = events.filter((e) => {
    const t = Date.parse(e?.at);
    return Number.isFinite(t) && nowMs - t <= MAX_AGE_MS;
  });
  return fresh.length > QUEUE_MAX ? fresh.slice(fresh.length - QUEUE_MAX) : fresh;
}

function parsePersisted(raw: unknown, owner: string): ActivityEvent[] {
  if (!raw || typeof raw !== 'object') return [];
  const q = raw as Partial<PersistedQueue>;
  if (q.owner !== owner || !Array.isArray(q.events)) return [];
  return q.events.filter(
    (e): e is ActivityEvent =>
      !!e &&
      typeof e === 'object' &&
      (ACTIVITY_KINDS as readonly string[]).includes(e.kind) &&
      typeof e.at === 'string',
  );
}

/** Network trouble and rate limits are worth retrying; anything else is dropped. */
function retryable(err: unknown): { retry: boolean; until?: number } {
  const e = toAppError(err);
  if (e.code === 'RATE_LIMITED') return { retry: true, until: e.retryAt?.getTime() };
  return {
    retry: e.code === 'ERR_OFFLINE' || e.code === 'UNKNOWN' || e.code === 'SESSION_EXPIRED',
  };
}

export function backoffMs(failures: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(failures - 1, 0), BACKOFF_MAX_MS);
}

export function createActivityQueue(deps: ActivityQueueDeps): ActivityQueue {
  const now = deps.now ?? Date.now;
  const platform = toPlatform(deps.platform);
  const appVersion = toAppVersion(deps.appVersion);
  let owner: string | null = null;
  let events: ActivityEvent[] = [];
  let inflight: Promise<void> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let failures = 0;
  let retryAt = 0;
  let sentAt: number[] = [];

  const persist = () => {
    try {
      deps.save(owner && events.length ? { owner, events } : null);
    } catch {
      // storage trouble never reaches the UI
    }
  };

  const sendOne = async (): Promise<boolean> => {
    const t = now();
    if (!owner || t < retryAt) return false;
    sentAt = sentAt.filter((s) => t - s < 3600_000);
    if (sentAt.length >= HOURLY_MAX) return false;
    events = prune(events, t);
    const batch = events.slice(0, BATCH_MAX);
    if (batch.length === 0) {
      persist();
      return false;
    }
    const who = owner;
    sentAt.push(t);
    let drop = true;
    try {
      await deps.send({ events: batch, platform, app_version: appVersion });
      failures = 0;
      retryAt = 0;
    } catch (err) {
      const r = retryable(err);
      if (r.retry) {
        drop = false;
        failures += 1;
        retryAt = Math.max(now() + backoffMs(failures), r.until ?? 0);
      }
    }
    // Signed out (or someone else signed in) while sending: that queue is gone.
    if (owner !== who) return false;
    if (drop) {
      const sent = new Set(batch);
      events = events.filter((e) => !sent.has(e));
    }
    persist();
    return drop;
  };

  const flush = (): Promise<void> => {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        // Keep going while whole batches leave cleanly (a backlog after being offline).
        while ((await sendOne()) && events.length > 0) {
          // next batch
        }
      } catch {
        // never throws
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  };

  return {
    start(userId) {
      if (owner === userId) return;
      owner = userId;
      failures = 0;
      retryAt = 0;
      try {
        events = prune(parsePersisted(deps.load(), userId), now());
      } catch {
        events = [];
      }
      persist();
      if (timer) clearInterval(timer);
      timer = setInterval(() => void flush(), FLUSH_MS);
    },
    stop() {
      owner = null;
      events = [];
      failures = 0;
      retryAt = 0;
      if (timer) clearInterval(timer);
      timer = null;
      try {
        deps.save(null);
      } catch {
        // ignore
      }
    },
    track(kind, opts = {}) {
      if (!owner) return;
      try {
        const ev = makeEvent(kind, opts, now());
        if (!ev) return;
        events = prune([...events, ev], now());
        persist();
        if (events.length >= BATCH_MAX) void flush();
      } catch {
        // never throws into the UI
      }
    },
    flush,
    pending: () => [...events],
    userId: () => owner,
  };
}

// ---------------------------------------------------------------------------
// The app's queue.

let queue: ActivityQueue | null = null;

/** Tests install their own queue (or null to turn it off again). */
export function setActivityQueue(q: ActivityQueue | null): void {
  queue = q;
}

function appVersion(): string | null {
  return (
    Application.nativeApplicationVersion ??
    (Constants.expoConfig?.version as string | undefined) ??
    null
  );
}

function getQueue(): ActivityQueue | null {
  if (queue || process.env.NODE_ENV === 'test') return queue;
  const rpc = createRpc(() => getSupabase() as unknown as RpcClient);
  queue = createActivityQueue({
    send: (args) => rpc('track_events', args),
    load: () => getStorage().get('activity.queue'),
    save: (q) =>
      q ? getStorage().set('activity.queue', q) : getStorage().remove('activity.queue'),
    platform: Platform.OS,
    appVersion: appVersion(),
  });
  return queue;
}

/** Records one activity event. Safe to call anywhere; a no-op when signed out. */
export function track(kind: ActivityKind, opts?: ActivityOptions): void {
  try {
    getQueue()?.track(kind, opts);
  } catch {
    // ignore
  }
}

/** Away this long, coming back counts as a new app open. */
export const APP_OPEN_GAP_MS = 30 * 60_000;

/**
 * Root layout: follows sign-in and sign-out, sends `app_open` once per launch
 * and again after 30 minutes in the background, and flushes when the app
 * leaves the foreground. Returns the cleanup.
 */
export function startActivity(
  auth: Pick<ReturnType<typeof getSupabase>['auth'], 'onAuthStateChange'> | null = null,
  now: () => number = Date.now,
): () => void {
  const q = getQueue();
  if (!q) return () => {};
  let opened = false;
  let backgroundAt: number | null = null;

  const appState = AppState.addEventListener('change', (s) => {
    if (s === 'active') {
      if (backgroundAt !== null && now() - backgroundAt >= APP_OPEN_GAP_MS) q.track('app_open');
      backgroundAt = null;
    } else if (s === 'background') {
      backgroundAt ??= now();
      void q.flush();
    }
  });

  let unsubAuth = () => {};
  try {
    const source = auth ?? getSupabase().auth;
    const { data } = source.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        q.start(session.user.id);
        if (!opened) {
          opened = true;
          q.track('app_open');
        }
      } else if (event === 'SIGNED_OUT') {
        q.stop();
        opened = false;
      }
    });
    unsubAuth = () => data.subscription.unsubscribe();
  } catch {
    // No auth client.
  }
  return () => {
    appState.remove();
    unsubAuth();
  };
}
