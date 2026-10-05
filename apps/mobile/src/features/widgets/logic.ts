import { fill } from '@/lib/format';

import { placeOf, type Meetup } from '../meetups/logic';

/**
 * Home screen widget + meetup Live Activity (P17-FEAT-01). Pure rules only:
 * what the app remembers about upcoming meetups, what the widget may show and
 * when a Live Activity starts, updates or ends. Native calls live in sync.ts.
 *
 * Privacy: the widget and the Live Activity only ever get the spot name, the
 * time, the other person's first name and a deep link. Never messages,
 * listing details, last names, photos or coordinates.
 */

/** The app keeps at most this many upcoming meetups on the device. */
export const MAX_KNOWN = 10;
/** A meetup stays "next" until 30 min after its start (the check-in window keeps running). */
export const AFTER_START_MS = 30 * 60_000;
/** A Live Activity may start this long before the meetup (Apple: a real, time-bound event). */
export const LIVE_LEAD_MS = 2 * 60 * 60_000;
/** At most this many future widget entries (iOS timeline). */
export const MAX_TIMELINE = 5;

/** What the device remembers about one meetup (no ids of people, no coordinates). */
export type KnownMeetup = {
  id: string;
  chatId: string;
  startsAt: string;
  place: string;
  firstName: string;
  status: Meetup['status'];
  myHere: boolean;
  otherHere: boolean;
  lateMinutes: number | null;
  lateIsMe: boolean;
};

/** "Aisha A." -> "Aisha". Empty when unknown. Capped so a long name can't overflow a widget. */
export function firstNameOf(displayName: string | null | undefined): string {
  const first = (displayName ?? '').trim().split(/\s+/)[0] ?? '';
  return first.slice(0, 20);
}

export function toKnown(m: Meetup, otherDisplayName?: string | null): KnownMeetup {
  return {
    id: m.id,
    chatId: m.chat_id,
    startsAt: m.starts_at,
    place: placeOf(m).slice(0, 60),
    firstName: firstNameOf(otherDisplayName),
    status: m.status,
    myHere: !!m.my_here_at,
    otherHere: !!m.other_here_at,
    lateMinutes: m.late_minutes,
    lateIsMe: m.late_is_me,
  };
}

function isOpen(k: KnownMeetup): boolean {
  return k.status === 'proposed' || k.status === 'confirmed';
}

/** Drops finished, cancelled and past meetups; soonest first; at most MAX_KNOWN. */
export function pruneKnown(list: readonly KnownMeetup[], now: Date): KnownMeetup[] {
  const cutoff = now.getTime() - AFTER_START_MS;
  return list
    .filter((k) => isOpen(k) && new Date(k.startsAt).getTime() >= cutoff)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, MAX_KNOWN);
}

/** Adds or replaces one meetup. A missing first name keeps the one we already had. */
export function upsertKnown(
  list: readonly KnownMeetup[],
  item: KnownMeetup,
  now: Date,
): KnownMeetup[] {
  const before = list.find((k) => k.id === item.id);
  const merged = { ...item, firstName: item.firstName || before?.firstName || '' };
  return pruneKnown([...list.filter((k) => k.id !== item.id), merged], now);
}

/** Reads storage defensively: anything malformed is dropped. */
export function parseKnown(raw: unknown): KnownMeetup[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (k): k is KnownMeetup =>
      !!k &&
      typeof k === 'object' &&
      typeof (k as KnownMeetup).id === 'string' &&
      typeof (k as KnownMeetup).chatId === 'string' &&
      typeof (k as KnownMeetup).startsAt === 'string' &&
      !Number.isNaN(new Date((k as KnownMeetup).startsAt).getTime()),
  );
}

/** The confirmed meetup the widget shows: soonest one that hasn't ended. */
export function nextMeetup(list: readonly KnownMeetup[], now: Date): KnownMeetup | null {
  return pruneKnown(list, now).find((k) => k.status === 'confirmed') ?? null;
}

// ---------------------------------------------------------------------------
// Widget payload

export type WidgetLabels = {
  title: string;
  empty: string;
  emptyBody: string;
  openChat: string;
  withName: string;
};

/**
 * Exactly what the widget extension gets. Labels travel with the data because
 * widget layouts can't import the app's strings (expo-widgets runtime rule).
 */
export type WidgetPayload =
  | {
      kind: 'meetup';
      title: string;
      place: string;
      withName: string;
      /** Epoch ms; the widget formats it in the phone's own clock. */
      startsAt: number;
      openLabel: string;
      url: string;
    }
  | {
      kind: 'empty';
      title: string;
      empty: string;
      emptyBody: string;
      url: string;
    };

export const WIDGET_PAYLOAD_KEYS = {
  meetup: ['kind', 'title', 'place', 'withName', 'startsAt', 'openLabel', 'url'],
  empty: ['kind', 'title', 'empty', 'emptyBody', 'url'],
} as const;

export function chatUrl(chatId: string): string {
  return `onlyswap://chat/${encodeURIComponent(chatId)}`;
}

export function meetupUrl(id: string): string {
  return `onlyswap://meetup/${encodeURIComponent(id)}`;
}

export const INBOX_URL = 'onlyswap://inbox';

export function buildWidgetPayload(next: KnownMeetup | null, labels: WidgetLabels): WidgetPayload {
  if (!next) {
    return {
      kind: 'empty',
      title: labels.title,
      empty: labels.empty,
      emptyBody: labels.emptyBody,
      url: INBOX_URL,
    };
  }
  return {
    kind: 'meetup',
    title: labels.title,
    place: next.place,
    withName: next.firstName ? fill(labels.withName, { name: next.firstName }) : '',
    startsAt: new Date(next.startsAt).getTime(),
    openLabel: labels.openChat,
    url: chatUrl(next.chatId),
  };
}

export type TimelineEntry = { at: number; payload: WidgetPayload };

/**
 * The widget's schedule without the app running: now, then each time the
 * shown meetup ends (30 min after its start), whatever comes next. iOS plays
 * it as a WidgetKit timeline; Android redraws from the same rules.
 */
export function widgetTimeline(
  list: readonly KnownMeetup[],
  now: Date,
  labels: WidgetLabels,
): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  let at = now.getTime();
  for (let i = 0; i < MAX_TIMELINE; i += 1) {
    const next = nextMeetup(list, new Date(at));
    out.push({ at, payload: buildWidgetPayload(next, labels) });
    if (!next) break;
    at = new Date(next.startsAt).getTime() + AFTER_START_MS + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Live Activity

export type LiveLabels = {
  title: string;
  titleNoName: string;
  onMyWay: string;
  imHere: string;
  theyreHere: string;
  late: string;
  started: string;
};

/** Live Activity content: same privacy rules as the widget. */
export type LiveProps = {
  meetupId: string;
  title: string;
  place: string;
  status: string;
  startsAt: number;
  startedLabel: string;
};

export function liveStatus(m: KnownMeetup, labels: LiveLabels): string {
  if (m.myHere) return labels.imHere;
  if (m.otherHere && m.firstName) return fill(labels.theyreHere, { name: m.firstName });
  if (m.lateIsMe && m.lateMinutes) return fill(labels.late, { n: m.lateMinutes });
  return labels.onMyWay;
}

export function buildLiveProps(m: KnownMeetup, labels: LiveLabels): LiveProps {
  return {
    meetupId: m.id,
    title: m.firstName ? fill(labels.title, { name: m.firstName }) : labels.titleNoName,
    place: m.place,
    status: liveStatus(m, labels),
    startsAt: new Date(m.startsAt).getTime(),
    startedLabel: labels.started,
  };
}

/** True while a confirmed meetup is in its Live Activity window. */
export function inLiveWindow(m: KnownMeetup, now: Date): boolean {
  const start = new Date(m.startsAt).getTime();
  const t = now.getTime();
  return m.status === 'confirmed' && t >= start - LIVE_LEAD_MS && t <= start + AFTER_START_MS;
}

export type RunningActivity = { activityId: string; meetupId: string; props: LiveProps | null };

export type LiveOp =
  | { type: 'end'; activityId: string }
  | { type: 'start'; meetupId: string; props: LiveProps; url: string; staleAt: number }
  | { type: 'update'; activityId: string; props: LiveProps; staleAt: number };

/**
 * Reconciles what is on the Lock Screen with what should be (pure):
 * - off (setting or OS), no meetup in its window -> end everything;
 * - one activity at most, for the next confirmed meetup, from 2 h before
 *   until 30 min after the start;
 * - content changes (check-in, late, place, time) -> update;
 * - extra or stale activities (other meetups, duplicates) -> end.
 */
export function planLiveActivity(input: {
  enabled: boolean;
  supported: boolean;
  next: KnownMeetup | null;
  running: readonly RunningActivity[];
  labels: LiveLabels;
  now: Date;
}): LiveOp[] {
  const { enabled, supported, next, running, labels, now } = input;
  if (!supported) return [];
  const want = enabled && next && inLiveWindow(next, now) ? next : null;
  const ops: LiveOp[] = [];
  let kept: RunningActivity | null = null;
  for (const r of running) {
    if (want && !kept && r.meetupId === want.id) kept = r;
    else ops.push({ type: 'end', activityId: r.activityId });
  }
  if (!want) return ops;
  const props = buildLiveProps(want, labels);
  const staleAt = props.startsAt + AFTER_START_MS;
  if (!kept) {
    ops.push({ type: 'start', meetupId: want.id, props, url: meetupUrl(want.id), staleAt });
  } else if (JSON.stringify(kept.props) !== JSON.stringify(props)) {
    ops.push({ type: 'update', activityId: kept.activityId, props, staleAt });
  }
  return ops;
}
