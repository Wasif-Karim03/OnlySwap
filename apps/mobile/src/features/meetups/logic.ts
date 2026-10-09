import { fill } from '@/lib/format';
import { meetup as copy, intlLocale } from '@/strings';

export type MeetupStatus = 'proposed' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';

/** One meetup (private.meetup_json). */
export type Meetup = {
  id: string;
  chat_id: string;
  status: MeetupStatus;
  starts_at: string;
  spot: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    police: boolean;
    hours: string | null;
  } | null;
  custom_place: string | null;
  proposed_by_me: boolean;
  confirmed_at: string | null;
  my_here_at: string | null;
  other_here_at: string | null;
  late_minutes: number | null;
  late_is_me: boolean;
  cancelled_by_me: boolean;
  cancel_reason: string | null;
  previous_starts_at: string | null;
  share_token: string | null;
  my_noshow_report: string | null;
};

export const LATE_OPTIONS = [5, 10, 15, 30] as const;

export function placeOf(m: Pick<Meetup, 'spot' | 'custom_place'>): string {
  return m.spot?.name ?? m.custom_place ?? '';
}

/** "Today 4:30 PM", "Tomorrow 10:00 AM", "Fri 6:00 PM" in the device zone. */
export function whenLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86_400_000);
  const time = d.toLocaleTimeString(intlLocale, { hour: 'numeric', minute: '2-digit' });
  const dayLabel =
    diff === 0
      ? copy.today
      : diff === 1
        ? copy.tomorrow
        : d.toLocaleDateString(intlLocale, { weekday: 'short' });
  return `${dayLabel} ${time}`;
}

/**
 * The day and time apart, for "Meetup today, 3:00 PM" and the big time on
 * the meetup screen (DEC 90). `day` is lower case ("today", "tomorrow") or
 * the short weekday; `dayTitle` is the same in sentence case.
 */
export function whenParts(
  iso: string,
  now: Date,
): { day: string; dayTitle: string; time: string; isToday: boolean } {
  const d = new Date(iso);
  const dayOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((dayOf(d) - dayOf(now)) / 86_400_000);
  const time = d.toLocaleTimeString(intlLocale, { hour: 'numeric', minute: '2-digit' });
  if (diff === 0) return { day: copy.todayLower, dayTitle: copy.today, time, isToday: true };
  if (diff === 1) return { day: copy.tomorrowLower, dayTitle: copy.tomorrow, time, isToday: false };
  const weekday = d.toLocaleDateString(intlLocale, { weekday: 'short' });
  const long = d.toLocaleDateString(intlLocale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  return { day: weekday, dayTitle: long, time, isToday: false };
}

/** The next 7 days as picker chips. */
export function dayOptions(now: Date): { key: string; label: string; date: Date }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const label =
      i === 0
        ? copy.today
        : i === 1
          ? copy.tomorrow
          : date.toLocaleDateString(intlLocale, { weekday: 'short', day: 'numeric' });
    return { key: date.toISOString().slice(0, 10), label, date };
  });
}

/**
 * Half-hour slots from 8 AM to 10 PM on `day`, at least 15 minutes from now
 * (the server's lower bound for propose_meetup).
 */
export function timeOptions(day: Date, now: Date): Date[] {
  const out: Date[] = [];
  for (let h = 8; h <= 22; h += 1) {
    for (const m of [0, 30]) {
      if (h === 22 && m === 30) continue;
      const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      if (t.getTime() >= now.getTime() + 15 * 60_000) out.push(t);
    }
  }
  return out;
}

export function timeLabel(d: Date): string {
  return d.toLocaleTimeString(intlLocale, { hour: 'numeric', minute: '2-digit' });
}

/** "Starts in 25 min" / "Started 5 min ago" (E12 countdown). */
export function countdown(iso: string, now: Date): string {
  const mins = Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
  const abs = Math.abs(mins);
  const t =
    abs < 60
      ? fill(copy.minutes, { n: abs })
      : fill(copy.hoursMinutes, { h: Math.floor(abs / 60), m: abs % 60 });
  return mins >= 0 ? fill(copy.startsIn, { time: t }) : fill(copy.startedAgo, { time: t });
}

/** What the meetup-day screen can do right now (server windows mirrored for the UI). */
export function meetupActions(m: Meetup, now: Date) {
  const start = new Date(m.starts_at).getTime();
  const t = now.getTime();
  const confirmed = m.status === 'confirmed';
  const open = m.status === 'proposed' || m.status === 'confirmed';
  return {
    checkIn: confirmed && !m.my_here_at && t >= start - 60 * 60_000 && t <= start + 60 * 60_000,
    late: confirmed && t <= start + 60 * 60_000,
    cancel: open,
    reschedule: open,
    share: open,
    noShow:
      confirmed &&
      !!m.my_here_at &&
      !m.other_here_at &&
      t >= start + 20 * 60_000 &&
      !m.my_noshow_report,
  };
}

/**
 * The other person's name on the meetup screen: from the meetup's chat
 * (get_chat) once it loads, else the name the opener passed along (the
 * `?name=` param, a first paint only), else "Deleted user" for a deleted
 * account. Empty while nothing is known yet.
 */
export function meetupOtherName(
  chat: { other_deleted?: boolean; other: { display_name: string | null } | null } | null,
  passed: string,
  deleted: string,
): string {
  if (chat) {
    if (chat.other_deleted || !chat.other) return deleted;
    if (chat.other.display_name) return chat.other.display_name;
  }
  return passed;
}

export function shareUrl(site: string, token: string): string {
  return `${site.replace(/\/+$/, '')}/m/${token}`;
}

// ---------------------------------------------------------------------------
// Spots map (R11-MAP-01): OpenFreeMap styles, no API key, no location.

/** OpenFreeMap styles (free, no key, no billing). Attribution is shown under the map. */
export const MAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

export function mapStyleFor(mode: 'light' | 'dark'): string {
  return MAP_STYLES[mode];
}

/** [west, south, east, north], the order MapLibre's camera expects. */
export type SpotBounds = [west: number, south: number, east: number, north: number];

/** About 110 m: a single spot (or spots on top of each other) still gets a sane zoom. */
export const MIN_SPAN_DEG = 0.002;

type Coord = { lat: number; lng: number };

export function validCoord(c: Coord): boolean {
  return (
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng) &&
    Math.abs(c.lat) <= 90 &&
    Math.abs(c.lng) <= 180 &&
    !(c.lat === 0 && c.lng === 0)
  );
}

/**
 * Bounds that contain every spot with a usable coordinate, widened to at least
 * MIN_SPAN_DEG on each axis. Null when there is nothing to show.
 */
export function spotsBounds(spots: readonly Coord[], minSpan = MIN_SPAN_DEG): SpotBounds | null {
  const ok = spots.filter(validCoord);
  if (ok.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const s of ok) {
    west = Math.min(west, s.lng);
    east = Math.max(east, s.lng);
    south = Math.min(south, s.lat);
    north = Math.max(north, s.lat);
  }
  const padLng = Math.max(0, (minSpan - (east - west)) / 2);
  const padLat = Math.max(0, (minSpan - (north - south)) / 2);
  return [
    Math.max(-180, west - padLng),
    Math.max(-90, south - padLat),
    Math.min(180, east + padLng),
    Math.min(90, north + padLat),
  ];
}
