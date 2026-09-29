import { fill } from '@/lib/format';
import { meetup as copy } from '@/strings/en';

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
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dayLabel =
    diff === 0
      ? copy.today
      : diff === 1
        ? copy.tomorrow
        : d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${dayLabel} ${time}`;
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
          : date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
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
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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

export function shareUrl(site: string, token: string): string {
  return `${site.replace(/\/+$/, '')}/m/${token}`;
}
