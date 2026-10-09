import type { IconName } from '@/components/icons/Icon';

import type { AppNotification } from './api';

/**
 * Display names are "First L." (profiles.display_name). The notification copy
 * comes from the server and names the other person that way ("Priya S.
 * offered $55.", a message's title "Jordan K."), so the first such name is the
 * person the row is about.
 */
const DISPLAY_NAME = /(\p{Lu}[\p{Ll}'’-]+) \p{Lu}\./u;

/** The other person's first name, when the notification names one. */
export function notificationActor(
  n: Pick<AppNotification, 'title' | 'body' | 'data'>,
): string | null {
  const given = n.data.actor_name;
  if (typeof given === 'string' && given.trim()) return given.trim();
  const m = DISPLAY_NAME.exec(`${n.title} ${n.body}`);
  return m?.[1] ?? null;
}

/** The listing a notification is about, for its photo. */
export function notificationListingId(n: Pick<AppNotification, 'data'>): string | null {
  const id = n.data.listing_id;
  return typeof id === 'string' && id ? id : null;
}

/** A neutral glyph only when there is neither a person nor an item to show. */
export function notificationGlyph(n: Pick<AppNotification, 'grp' | 'type'>): IconName {
  if (n.grp === 'meetups' || n.type.startsWith('meetup')) return 'cal';
  if (n.grp === 'deals') return 'swap';
  if (n.grp === 'quad' || n.type.startsWith('quad')) return 'quad';
  if (n.grp === 'offers') return 'tag';
  return 'bell';
}
