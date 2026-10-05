import { fill } from '@/lib/format';
import { waitlist as copy } from '@/strings';

import type { WaitlistInfo } from './api';

/** {SITE}/i/{code}: the invite page on the public site (R11-INVITE-01). */
export function inviteLink(site: string, code: string): string {
  return `${site.replace(/\/+$/, '')}/i/${encodeURIComponent(code)}`;
}

/** People still needed before the campus opens. */
export function peopleLeft(info: Pick<WaitlistInfo, 'members' | 'threshold'>): number {
  return Math.max(info.threshold - info.members, 0);
}

/** 0..1 for the progress bar. */
export function progressOf(info: Pick<WaitlistInfo, 'members' | 'threshold'>): number {
  if (info.threshold <= 0) return 1;
  return Math.min(Math.max(info.members / info.threshold, 0), 1);
}

export function positionText(
  info: Pick<WaitlistInfo, 'members' | 'threshold' | 'position'>,
): string {
  const left = peopleLeft(info);
  if (left === 0) return copy.almost;
  if (info.position === null) return fill(copy.positionNone, { left });
  if (left === 1) return fill(copy.positionOne, { position: info.position });
  return fill(copy.position, { position: info.position, left });
}

export function invitedText(n: number): string {
  if (n <= 0) return copy.invitedNone;
  if (n === 1) return copy.invitedOne;
  return fill(copy.invited, { n });
}

export function shareMessage(info: Pick<WaitlistInfo, 'campus'>, link: string): string {
  return info.campus
    ? fill(copy.shareMessage, { campus: info.campus.short_name, link })
    : fill(copy.shareMessageNoCampus, { link });
}

/**
 * What the waitlist screen does with fresh data: stay, show A10 once (the
 * campus opened after you joined), or hand back to the launch gate (open and
 * already seen, so the gate routes you in).
 */
export function waitlistNext(
  info: Pick<WaitlistInfo, 'campus' | 'show_unlocked' | 'position'>,
): 'wait' | 'unlocked' | 'gate' {
  if (info.show_unlocked) return 'unlocked';
  // Only when you're no longer waiting (no position), so the gate can't bounce you back here.
  if (info.campus?.status === 'live' && info.position === null) return 'gate';
  return 'wait';
}
