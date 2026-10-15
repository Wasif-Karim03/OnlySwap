import { fill, money } from '@/lib/format';
import { campus as copy } from '@/strings';

import type { FeedCursor, FeedItem } from '../feed/logic';
import { whenParts } from '../meetups/logic';
import {
  cleanPrice,
  DESCRIPTION_MAX,
  MEET_NOTE_MAX,
  PRICE_MAX_CENTS,
  priceToCents,
  TITLE_MAX,
  TITLE_MIN,
  type CreateListingArgs,
} from '../sell/logic';

/**
 * Around campus rules (P6-CAMP-01, P5-SELL-06, P5-SELL-08). Pure functions so
 * the countdown, the filters and the two post forms are unit tested; the
 * server re-checks everything in create_listing and get_campus_feed.
 */

export type CampusFilter = 'all' | 'news' | 'food' | 'free' | 'wanted' | 'new';
export const CAMPUS_FILTERS: CampusFilter[] = ['all', 'news', 'food', 'free', 'wanted', 'new'];

export function isCampusFilter(x: unknown): x is CampusFilter {
  return typeof x === 'string' && (CAMPUS_FILTERS as string[]).includes(x);
}

/** One post from get_campus_feed: the feed card plus the Around campus fields. */
export type CampusItem = FeedItem & {
  wanted_max_cents: number | null;
  wanted_ref: string | null;
  /** First meetup spot's name, else the typed place. */
  place: string | null;
};

export type Founding = { limit: number; left: number; mine: boolean };

export type CampusPage = {
  items: CampusItem[];
  next_cursor: FeedCursor | null;
  // Page one only; later pages send null (E-13).
  day_one: boolean | null;
  active_listings: number | null;
  founding: Founding | null;
};

// ---------------------------------------------------------------------------
// Free food countdown

export type Countdown =
  | { kind: 'gone' }
  | { kind: 'under_minute' }
  | { kind: 'minutes'; m: number }
  | { kind: 'hours'; h: number; m: number };

/** Time left until `expiresAt`; null when the post doesn't expire. */
export function countdown(expiresAt: string | null, now: Date): Countdown | null {
  if (!expiresAt) return null;
  const end = Date.parse(expiresAt);
  if (Number.isNaN(end)) return null;
  const ms = end - now.getTime();
  if (ms <= 0) return { kind: 'gone' };
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return { kind: 'under_minute' };
  if (mins < 60) return { kind: 'minutes', m: mins };
  return { kind: 'hours', h: Math.floor(mins / 60), m: mins % 60 };
}

export function countdownLabel(c: Countdown): string {
  switch (c.kind) {
    case 'gone':
      return copy.gone;
    case 'under_minute':
      return copy.underMinute;
    case 'minutes':
      return fill(copy.minutesLeft, { n: c.m });
    case 'hours':
      return c.m === 0
        ? fill(copy.hoursOnly, { h: c.h })
        : fill(copy.hoursLeft, { h: c.h, m: c.m });
  }
}

/** Under 15 minutes: the tag turns amber so people know to hurry. */
export function isUrgent(c: Countdown | null): boolean {
  return c !== null && (c.kind === 'under_minute' || (c.kind === 'minutes' && c.m < 15));
}

export function isGone(item: Pick<CampusItem, 'kind' | 'expires_at'>, now: Date): boolean {
  return item.kind === 'food' && countdown(item.expires_at, now)?.kind === 'gone';
}

/** How often the countdown re-renders: every second in the last minute, else every 15 s. */
export function tickMs(c: Countdown | null): number {
  return c?.kind === 'under_minute' ? 1000 : 15_000;
}

// ---------------------------------------------------------------------------
// Feed

/** Appends a page, skipping posts already shown (a bump can move one across pages). */
export function mergeCampusPages(pages: CampusPage[]): CampusItem[] {
  const seen = new Set<string>();
  const out: CampusItem[] = [];
  for (const p of pages) {
    for (const item of p.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

/** "I have this" shows on other people's open Wanted posts only. */

export function canAnswer(item: Pick<CampusItem, 'kind' | 'is_own' | 'status'>): boolean {
  return item.kind === 'wanted' && !item.is_own && item.status === 'active';
}

/** "Up to $40", or "Any budget". */
export function budgetLabel(cents: number | null): string {
  if (cents === null || cents === undefined) return copy.anyBudget;
  return fill(copy.upTo, { price: money(cents) });
}

/** The founding sellers card: open spots, or your own badge. Hidden when neither. */
export function foundingState(f: Founding | null | undefined): 'mine' | 'open' | null {
  if (!f || f.limit <= 0) return null;
  if (f.mine) return 'mine';
  return f.left > 0 ? 'open' : null;
}

export function dayOneBody(activeListings: number): string {
  if (activeListings <= 0) return copy.dayOneBodyNone;
  if (activeListings === 1) return copy.dayOneBodyOne;
  return fill(copy.dayOneBody, { n: activeListings });
}

// ---------------------------------------------------------------------------
// C02 Post free food

/** "Around for about" chips; create_listing takes 15 to 180 minutes. */
export const FOOD_MINUTES = [30, 60, 120, 180] as const;
export type FoodMinutes = (typeof FOOD_MINUTES)[number];
export const FOOD_MINUTES_DEFAULT: FoodMinutes = 60;
export const FOOD_MIN = 15;
export const FOOD_MAX = 180;

export function foodMinutesLabel(m: FoodMinutes): string {
  return copy.foodMinutes[`m${m}`];
}

export type FoodForm = {
  title: string;
  /** A campus meetup spot, or null for "Somewhere else". */
  spotId: string | null;
  /** Typed place when no spot is picked (60 characters, meet_note). */
  place: string;
  minutes: number;
  /** Uploaded photo key, if any. */
  photo: UploadedPhotoRef | null;
};

export type UploadedPhotoRef = {
  path: string;
  thumbPath: string;
  width: number;
  height: number;
  blurhash: string | null;
};

export type FormError =
  | { field: 'title'; kind: 'short' | 'long' }
  | { field: 'place'; kind: 'missing' | 'long' }
  | { field: 'minutes'; kind: 'range' }
  | { field: 'budget'; kind: 'high' }
  | { field: 'description'; kind: 'long' }
  | { field: 'link'; kind: 'invalid' | 'long' }
  | { field: 'event'; kind: 'missing' | 'past' | 'far' };

function titleErrors(title: string): FormError[] {
  const t = title.trim();
  if (t.length < TITLE_MIN) return [{ field: 'title', kind: 'short' }];
  if (t.length > TITLE_MAX) return [{ field: 'title', kind: 'long' }];
  return [];
}

/** Every problem at once, in screen order. A place is needed: food nobody can find is no use. */
export function validateFood(f: FoodForm): FormError[] {
  const errors = titleErrors(f.title);
  const place = f.place.trim();
  if (!f.spotId && place === '') errors.push({ field: 'place', kind: 'missing' });
  else if (place.length > MEET_NOTE_MAX) errors.push({ field: 'place', kind: 'long' });
  if (!Number.isInteger(f.minutes) || f.minutes < FOOD_MIN || f.minutes > FOOD_MAX) {
    errors.push({ field: 'minutes', kind: 'range' });
  }
  return errors;
}

export function foodArgs(id: string, f: FoodForm): CreateListingArgs {
  return {
    id,
    kind: 'food',
    title: f.title.trim(),
    description: null,
    category_id: null,
    condition: null,
    price_cents: 0,
    open_to_offers: false,
    photos: f.photo ? [photoArg(f.photo)] : [],
    meet_spot_ids: f.spotId ? [f.spotId] : [],
    meet_note: f.place.trim() || null,
    availability: [],
    pickup_by: null,
    food_minutes: f.minutes,
  };
}

function photoArg(p: UploadedPhotoRef) {
  return {
    path: p.path,
    thumb_path: p.thumbPath,
    width: p.width,
    height: p.height,
    blurhash: p.blurhash,
  };
}

// ---------------------------------------------------------------------------
// C03 Post a Wanted

export type WantedForm = {
  title: string;
  /** Dollars as typed; empty means any budget. */
  budget: string;
  categoryId: number | null;
  description: string;
  photo: UploadedPhotoRef | null;
};

/** Budget in cents, or null for "any". */
export function budgetCents(budget: string): number | null {
  const clean = cleanPrice(budget);
  if (clean === '' || clean === '.') return null;
  return priceToCents(clean);
}

export function validateWanted(f: WantedForm): FormError[] {
  const errors = titleErrors(f.title);
  const cents = budgetCents(f.budget);
  if (cents !== null && cents > PRICE_MAX_CENTS) errors.push({ field: 'budget', kind: 'high' });
  if (f.description.trim().length > DESCRIPTION_MAX) {
    errors.push({ field: 'description', kind: 'long' });
  }
  return errors;
}

export function wantedArgs(id: string, f: WantedForm): CreateListingArgs {
  return {
    id,
    kind: 'wanted',
    title: f.title.trim(),
    description: f.description.trim() || null,
    category_id: f.categoryId,
    condition: null,
    price_cents: 0,
    open_to_offers: false,
    photos: f.photo ? [photoArg(f.photo)] : [],
    meet_spot_ids: [],
    meet_note: null,
    availability: [],
    pickup_by: null,
    wanted_max_cents: budgetCents(f.budget),
  };
}

export function formErrorText(e: FormError): string {
  switch (e.field) {
    case 'title':
      return e.kind === 'short' ? copy.errors.titleShort : copy.errors.titleLong;
    case 'place':
      return e.kind === 'missing' ? copy.errors.placeMissing : copy.errors.placeLong;
    case 'budget':
      return copy.errors.budgetHigh;
    case 'description':
      return copy.errors.descriptionLong;
    case 'minutes':
      return copy.errors.minutesRange;
    case 'link':
      return e.kind === 'long' ? copy.errors.linkLong : copy.errors.linkInvalid;
    case 'event':
      return e.kind === 'missing'
        ? copy.errors.eventMissing
        : e.kind === 'past'
          ? copy.errors.eventPast
          : copy.errors.eventFar;
  }
}

/**
 * Friendly copy for a failed post: the daily caps (3 food, 5 Wanted, 3 on a
 * new account's first day, 20 overall) and banned words get their own lines.
 * Returns null for anything the shared error copy already covers.
 */
export function postErrorText(e: {
  code: string;
  action?: string;
  detail?: string;
}): string | null {
  if (e.code === 'RATE_LIMITED') {
    switch (e.action) {
      case 'create_food':
        return copy.errors.foodCap;
      case 'create_wanted':
        return copy.errors.wantedCap;
      case 'create_news':
        return copy.errors.newsCap;
      case 'create_listing_new':
        return copy.errors.newAccountCap;
      case 'create_listing':
        return copy.errors.dailyCap;
      default:
        return null;
    }
  }
  if (e.code === 'BANNED_TERM' && e.detail) return fill(copy.errors.banned, { term: e.detail });
  if (e.code === 'ERR_OFFLINE' || e.code === 'UNKNOWN') return copy.errors.postFailed;
  return null;
}

// ---------------------------------------------------------------------------
// Post news (DEC 98)

export const NEWS_PHOTOS_MAX = 4;
export const LINK_MAX = 300;
export const EVENT_DAYS_MAX = 90;

export type NewsForm = {
  title: string;
  description: string;
  /** As typed; "example.com" gets https:// added. */
  link: string;
  /** On when "It's an event" is switched on. */
  isEvent: boolean;
  /** The picked day and time, combined; null until both are picked. */
  eventAt: Date | null;
  place: string;
  photos: UploadedPhotoRef[];
};

export type CreateNewsArgs = {
  id: string;
  title: string;
  description: string | null;
  photos: ReturnType<typeof photoArg>[];
  link_url: string | null;
  event_at: string | null;
  place: string | null;
};

/** The link as it will be saved: trimmed, https:// added when there's no scheme. Empty is null. */
export function normalizeLink(link: string): string | null {
  const t = link.trim();
  if (t === '') return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** Mirrors create_news: http(s), no spaces, a dot in the host part. */
export function isValidLink(link: string): boolean {
  return /^https?:\/\/[^\s]+\.[^\s]+$/i.test(link);
}

/** Every problem at once, in screen order. */
export function validateNews(f: NewsForm, now: Date): FormError[] {
  const errors = titleErrors(f.title);
  if (f.description.trim().length > DESCRIPTION_MAX) {
    errors.push({ field: 'description', kind: 'long' });
  }
  const link = normalizeLink(f.link);
  if (link !== null) {
    if (link.length > LINK_MAX) errors.push({ field: 'link', kind: 'long' });
    else if (!isValidLink(link)) errors.push({ field: 'link', kind: 'invalid' });
  }
  if (f.isEvent) {
    if (!f.eventAt) errors.push({ field: 'event', kind: 'missing' });
    else if (f.eventAt.getTime() <= now.getTime()) errors.push({ field: 'event', kind: 'past' });
    else if (f.eventAt.getTime() > now.getTime() + EVENT_DAYS_MAX * 86_400_000) {
      errors.push({ field: 'event', kind: 'far' });
    }
  }
  if (f.place.trim().length > MEET_NOTE_MAX) errors.push({ field: 'place', kind: 'long' });
  return errors;
}

export function newsArgs(id: string, f: NewsForm): CreateNewsArgs {
  return {
    id,
    title: f.title.trim(),
    description: f.description.trim() || null,
    photos: f.photos.slice(0, NEWS_PHOTOS_MAX).map(photoArg),
    link_url: normalizeLink(f.link),
    event_at: f.isEvent && f.eventAt ? f.eventAt.toISOString() : null,
    place: f.place.trim() || null,
  };
}

/** "example.com" from a link, for the link row on a post. */
export function linkHost(link: string): string {
  const m = /^https?:\/\/([^/?#\s]+)/i.exec(link);
  return (m?.[1] ?? link).replace(/^www\./i, '');
}

/** A day and a time picked separately, as one Date. */
export function combineDayTime(day: Date, time: Date): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    time.getHours(),
    time.getMinutes(),
  );
}

/** "Friday, Mar 12 at 7:00 PM" (Today / Tomorrow when close) for an event post. */
export function eventLabel(iso: string, now: Date): string {
  const p = whenParts(iso, now);
  return fill(copy.eventWhen, { day: p.dayTitle, time: p.time });
}
