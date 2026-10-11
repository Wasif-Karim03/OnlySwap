// Plain words for database values (docs/ADMIN_CHECKLIST.md §3). Every enum the
// console shows goes through here so staff never read `no_show` or
// `unlock_threshold`. Pure and tested (test/labels.test.ts).

/** Pill colors from the approved mock: green good, red bad, amber waiting, sky info, lilac Quad or demo. */
export type Tone = 'green' | 'red' | 'amber' | 'sky' | 'lilac' | 'peach' | 'neutral';

export type Labeled = { label: string; tone: Tone };

/** "unlock_threshold" -> "Unlock threshold" (the fallback for anything not in a map). */
export function humanize(value: string | null | undefined): string {
  if (!value) return '';
  const s = value.replace(/[_.]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "1 strike", "2 strikes", "0 people" (irregular plural as the third argument). */
export function plural(n: number, one: string, many?: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : (many ?? `${one}s`)}`;
}

function pick(map: Record<string, Labeled>, value: string | null | undefined): Labeled {
  if (!value) return { label: '', tone: 'neutral' };
  return map[value] ?? { label: humanize(value), tone: 'neutral' };
}

// ---------------------------------------------------------------------------
// Reports

const REPORT_REASONS: Record<string, Labeled> = {
  threat: { label: 'Threat', tone: 'red' },
  self_harm: { label: 'Self-harm', tone: 'red' },
  minor_safety: { label: 'Minor safety', tone: 'red' },
  harassment: { label: 'Harassment', tone: 'red' },
  hate: { label: 'Hate', tone: 'red' },
  sexual: { label: 'Sexual content', tone: 'red' },
  scam: { label: 'Scam or fake', tone: 'amber' },
  counterfeit: { label: 'Counterfeit', tone: 'amber' },
  stolen: { label: 'Stolen', tone: 'amber' },
  misleading: { label: 'Misleading', tone: 'amber' },
  not_allowed: { label: 'Not allowed', tone: 'amber' },
  no_show: { label: 'No-show', tone: 'amber' },
  calls_out_student: { label: 'Calls out a student', tone: 'lilac' },
  spam: { label: 'Spam', tone: 'neutral' },
  other: { label: 'Other', tone: 'neutral' },
};
export const reportReason = (v: string | null | undefined) => pick(REPORT_REASONS, v);

const REPORT_STATUSES: Record<string, Labeled> = {
  open: { label: 'Open', tone: 'amber' },
  actioned: { label: 'Actioned', tone: 'green' },
  dismissed: { label: 'Dismissed', tone: 'neutral' },
};
export const reportStatus = (v: string | null | undefined) => pick(REPORT_STATUSES, v);

const TARGET_TYPES: Record<string, string> = {
  listing: 'Listing',
  user: 'Person',
  chat: 'Chat',
  message: 'Message in a chat',
  quad_post: 'Quad post',
  quad_reply: 'Quad reply',
};
export const targetType = (v: string | null | undefined) =>
  v ? (TARGET_TYPES[v] ?? humanize(v)) : '';

/** Button text for a report action; "Remove content" says what it removes. */
export function reportActionLabel(action: string, target?: string, suspendDays?: number): string {
  switch (action) {
    case 'dismiss':
      return 'Dismiss';
    case 'remove_content':
      return target === 'listing'
        ? 'Remove listing'
        : target === 'message'
          ? 'Remove message'
          : 'Remove content';
    case 'warn':
      return 'Warn';
    case 'strike':
      return 'Strike';
    case 'suspend':
      return suspendDays ? `Suspend ${plural(suspendDays, 'day')}` : 'Suspend';
    case 'ban':
      return 'Ban';
    default:
      return humanize(action);
  }
}

// ---------------------------------------------------------------------------
// People

const USER_STATUSES: Record<string, Labeled> = {
  active: { label: 'Active', tone: 'green' },
  waitlist: { label: 'Waitlist', tone: 'amber' },
  reverify: { label: 'Re-verify', tone: 'sky' },
  paused: { label: 'Paused', tone: 'amber' },
  suspended: { label: 'Suspended', tone: 'red' },
  banned: { label: 'Banned', tone: 'red' },
};
export const userStatus = (v: string | null | undefined) => pick(USER_STATUSES, v);
export const USER_STATUS_OPTIONS = Object.entries(USER_STATUSES).map(([id, l]) => ({
  id,
  label: l.label,
}));

const YEARS: Record<string, string> = {
  freshman: 'Freshman',
  sophomore: 'Sophomore',
  junior: 'Junior',
  senior: 'Senior',
  grad: 'Grad',
  other: 'Other',
};
export const classYear = (v: string | null | undefined) => (v ? (YEARS[v] ?? humanize(v)) : '');
export const YEAR_OPTIONS = Object.entries(YEARS).map(([id, label]) => ({ id, label }));

const PLATFORMS: Record<string, string> = { ios: 'iPhone', android: 'Android', web: 'Web' };
export const platform = (v: string | null | undefined) => (v ? (PLATFORMS[v] ?? humanize(v)) : '');

export const role = (v: string | null | undefined) =>
  v === 'owner' ? 'Owner' : v === 'moderator' ? 'Moderator' : humanize(v);

const AGE_METHODS: Record<string, string> = {
  os_signal: 'Phone age range',
  self_declared: 'Said they are 18+',
  review: 'Checked by staff',
};
export const ageMethod = (v: string | null | undefined) =>
  v ? (AGE_METHODS[v] ?? humanize(v)) : '';

// ---------------------------------------------------------------------------
// Listings

const LISTING_STATUSES: Record<string, Labeled> = {
  active: { label: 'Active', tone: 'green' },
  hold: { label: 'On hold', tone: 'amber' },
  held_review: { label: 'Held for review', tone: 'amber' },
  sold: { label: 'Sold', tone: 'sky' },
  expired: { label: 'Expired', tone: 'neutral' },
  removed: { label: 'Removed', tone: 'red' },
  deleted: { label: 'Deleted', tone: 'neutral' },
};
export const listingStatus = (v: string | null | undefined) => pick(LISTING_STATUSES, v);

// ---------------------------------------------------------------------------
// Campuses

/** Campus pill: the demo campus is lilac "Review demo"; a waitlist shows its progress. */
export function campusStatus(c: {
  status: string;
  is_demo?: boolean;
  members?: number | null;
  waitlist?: number | null;
  unlock_threshold?: number | null;
}): Labeled {
  if (c.is_demo) return { label: 'Review demo', tone: 'lilac' };
  if (c.status === 'live') return { label: 'Live', tone: 'green' };
  if (c.status === 'paused') return { label: 'Paused', tone: 'amber' };
  if (c.status === 'waitlist') {
    const n = c.waitlist ?? c.members;
    return {
      label:
        n !== null && n !== undefined && c.unlock_threshold
          ? `Waitlist ${n.toLocaleString('en-US')}/${c.unlock_threshold.toLocaleString('en-US')}`
          : 'Waitlist',
      tone: 'amber',
    };
  }
  return { label: humanize(c.status), tone: 'neutral' };
}

/** Campus dials in plain words, with the unit shown after the number. */
export const CAMPUS_DIALS = [
  { key: 'unlock_threshold', label: 'Opens at', unit: 'students' },
  { key: 'founding_seller_limit', label: 'Founding sellers', unit: 'first sellers' },
  { key: 'offers_per_hour', label: 'Offers per hour', unit: 'per student' },
  { key: 'noshow_pause_threshold', label: 'No-shows before pause', unit: 'no-shows' },
  { key: 'reverify_months', label: 'Re-verify every', unit: 'months' },
] as const;
export type CampusDial = (typeof CAMPUS_DIALS)[number]['key'];

const DOMAIN_KINDS: Record<string, Labeled> = {
  student: { label: 'Student', tone: 'green' },
  blocked: { label: 'Blocked', tone: 'red' },
};
export const domainKind = (v: string | null | undefined) => pick(DOMAIN_KINDS, v);

export const spotDesignation = (v: string | null | undefined): Labeled =>
  v === 'police'
    ? { label: 'Police-designated', tone: 'sky' }
    : { label: 'Public', tone: 'neutral' };

// ---------------------------------------------------------------------------
// Appeals, Quad, announcements, banned words

const APPEAL_SUBJECTS: Record<string, string> = {
  strike: 'a strike',
  noshow: 'a no-show',
  pause: 'a pause',
  suspension: 'a suspension',
  listing: 'a removed listing',
};
export const appealSubject = (v: string | null | undefined) =>
  v ? (APPEAL_SUBJECTS[v] ?? `a ${humanize(v).toLowerCase()}`) : '';

const APPEAL_STATUSES: Record<string, Labeled> = {
  open: { label: 'Open', tone: 'amber' },
  upheld: { label: 'Upheld', tone: 'neutral' },
  overturned: { label: 'Overturned', tone: 'green' },
};
export const appealStatus = (v: string | null | undefined) => pick(APPEAL_STATUSES, v);

const QUAD_STATUSES: Record<string, Labeled> = {
  held: { label: 'Held', tone: 'amber' },
  hidden: { label: 'Hidden', tone: 'neutral' },
  visible: { label: 'Visible', tone: 'green' },
  removed: { label: 'Removed', tone: 'red' },
};
export const quadStatus = (v: string | null | undefined) => pick(QUAD_STATUSES, v);

const ANNOUNCEMENT_TYPES: Record<string, Labeled> = {
  safety: { label: 'Safety', tone: 'red' },
  news: { label: 'News', tone: 'neutral' },
  update: { label: 'Update', tone: 'sky' },
};
export const announcementType = (v: string | null | undefined) => pick(ANNOUNCEMENT_TYPES, v);

export const bannedAction = (v: string | null | undefined): Labeled =>
  v === 'block'
    ? { label: 'Block', tone: 'red' }
    : v === 'review'
      ? { label: 'Hold for review', tone: 'amber' }
      : { label: humanize(v), tone: 'neutral' };

const BANNED_MATCH: Record<string, string> = { word: 'Word', phrase: 'Phrase', regex: 'Pattern' };
export const bannedMatch = (v: string | null | undefined) =>
  v ? (BANNED_MATCH[v] ?? humanize(v)) : '';

// ---------------------------------------------------------------------------
// App config (Settings > Switches and limits)

const CONFIG_KEYS: Record<string, { label: string; help?: string }> = {
  maintenance: { label: 'Maintenance mode', help: 'Shows a pause screen in the app' },
  chat_photos_enabled: { label: 'Chat photos', help: 'Needs photo scanning or your OK' },
  quad_enabled: { label: 'Quad', help: 'The anonymous campus board' },
  rules_version: {
    label: 'Rules version',
    help: 'Raising it asks everyone to accept the rules again',
  },
  rules_changes: { label: 'Rules changes', help: 'What changed in each rules version' },
  min_version_ios: { label: 'Minimum iPhone app version' },
  min_version_android: { label: 'Minimum Android app version' },
  manual_unlock_campuses: {
    label: 'Campuses opened by hand',
    help: 'These campuses wait for you instead of opening at their threshold',
  },
  signups_enabled: { label: 'Sign-ups open', help: 'Turn off to stop new accounts' },
};
export const configKey = (k: string) => CONFIG_KEYS[k]?.label ?? humanize(k);
export const configHelp = (k: string) => CONFIG_KEYS[k]?.help ?? '';

// ---------------------------------------------------------------------------
// Audit log

const AUDIT_ACTIONS: Record<string, Labeled> = {
  'report.view': { label: 'Opened report', tone: 'neutral' },
  'report.dismiss': { label: 'Dismissed report', tone: 'neutral' },
  'report.remove_content': { label: 'Removed content', tone: 'red' },
  'report.warn': { label: 'Warned', tone: 'amber' },
  'report.strike': { label: 'Gave a strike', tone: 'amber' },
  'report.suspend': { label: 'Suspended', tone: 'red' },
  'report.ban': { label: 'Banned', tone: 'red' },
  'chat.read': { label: 'Read a reported chat', tone: 'amber' },
  'user.view': { label: 'Opened profile', tone: 'neutral' },
  'person.view': { label: 'Opened profile', tone: 'neutral' },
  'user.status.active': { label: 'Made active', tone: 'green' },
  'user.status.paused': { label: 'Paused', tone: 'amber' },
  'user.status.suspended': { label: 'Suspended', tone: 'red' },
  'user.status.banned': { label: 'Banned', tone: 'red' },
  'user.force_reverify': { label: 'Asked to re-verify', tone: 'sky' },
  change_email: { label: 'Changed email', tone: 'sky' },
  'strike.clear': { label: 'Cleared a strike', tone: 'green' },
  'listing.active': { label: 'Approved listing', tone: 'green' },
  'listing.removed': { label: 'Removed listing', tone: 'red' },
  'listing.held_review': { label: 'Held listing', tone: 'amber' },
  'listing.bulk_active': { label: 'Approved listings in bulk', tone: 'green' },
  'listing.bulk_removed': { label: 'Removed listings in bulk', tone: 'red' },
  'listing.bulk_held_review': { label: 'Held listings in bulk', tone: 'amber' },
  'listing.activity_view': { label: 'Opened listing activity', tone: 'neutral' },
  'appeal.upheld': { label: 'Upheld appeal', tone: 'neutral' },
  'appeal.overturned': { label: 'Overturned appeal', tone: 'green' },
  'campus.update': { label: 'Changed campus', tone: 'sky' },
  'campus.open': { label: 'Opened campus', tone: 'green' },
  'campus.create': { label: 'Added school', tone: 'green' },
  'domain.upsert': { label: 'Saved email domain', tone: 'sky' },
  'domain.delete': { label: 'Deleted email domain', tone: 'sky' },
  'spot.upsert': { label: 'Saved meetup spot', tone: 'sky' },
  'config.set': { label: 'Changed setting', tone: 'sky' },
  'quad.approve': { label: 'Approved Quad post', tone: 'green' },
  'quad.remove': { label: 'Removed Quad post', tone: 'red' },
  'quad.reveal': { label: 'Revealed Quad author', tone: 'red' },
  'admin.invite': { label: 'Added admin', tone: 'sky' },
  'admin.remove': { label: 'Removed admin', tone: 'sky' },
  'announcement.create': { label: 'Posted announcement', tone: 'lilac' },
  'banned_word.create': { label: 'Added banned word', tone: 'sky' },
  'banned_word.update': { label: 'Changed banned word', tone: 'sky' },
  'banned_word.delete': { label: 'Deleted banned word', tone: 'sky' },
  'support.view': { label: 'Opened support request', tone: 'neutral' },
  'support.update': { label: 'Answered support request', tone: 'sky' },
  'review_account.upsert': { label: 'Saved review account', tone: 'sky' },
  'review_account.delete': { label: 'Removed review account', tone: 'sky' },
  'banned_hash.add': { label: 'Banned an email', tone: 'red' },
  'banned_hash.delete': { label: 'Unbanned an email', tone: 'green' },
  'category.create': { label: 'Added category', tone: 'sky' },
  'category.update': { label: 'Changed category', tone: 'sky' },
};
export const auditAction = (v: string | null | undefined) => pick(AUDIT_ACTIONS, v);

/** The Action filter on the audit log: label and the action prefix sent to the server. */
export const AUDIT_ACTION_FILTERS = [
  { prefix: 'report.', label: 'Reports' },
  { prefix: 'user.', label: 'Account changes' },
  { prefix: 'person.view', label: 'Profile views' },
  { prefix: 'chat.read', label: 'Chats read' },
  { prefix: 'listing.', label: 'Listings' },
  { prefix: 'quad.', label: 'Quad' },
  { prefix: 'appeal.', label: 'Appeals' },
  { prefix: 'strike.', label: 'Strikes' },
  { prefix: 'campus.', label: 'Campuses' },
  { prefix: 'spot.', label: 'Meetup spots' },
  { prefix: 'config.', label: 'Settings' },
  { prefix: 'admin.', label: 'Team' },
  { prefix: 'announcement.', label: 'Announcements' },
  { prefix: 'banned_word.', label: 'Banned words' },
  { prefix: 'support.', label: 'Support' },
  { prefix: 'review_account.', label: 'Review accounts' },
  { prefix: 'banned_hash.', label: 'Banned emails' },
  { prefix: 'category.', label: 'Categories' },
] as const;

// ---------------------------------------------------------------------------
// Activity events (admin_activity_feed kinds, API §4.1)

export type EventStyle = { label: string; tone: Tone; icon: IconName };
export type IconName =
  | 'home'
  | 'pulse'
  | 'users'
  | 'user'
  | 'tag'
  | 'flag'
  | 'chart'
  | 'quad'
  | 'chat'
  | 'pin'
  | 'book'
  | 'gear'
  | 'log'
  | 'search'
  | 'down'
  | 'x'
  | 'heart'
  | 'dollar'
  | 'eye'
  | 'check'
  | 'plus'
  | 'lock'
  | 'filter'
  | 'ext'
  | 'scale'
  | 'logout'
  | 'mail'
  | 'clock'
  | 'refresh'
  | 'thumb'
  | 'trash'
  | 'school'
  | 'server';

const EVENTS: Record<string, EventStyle> = {
  signup: { label: 'Joined', tone: 'peach', icon: 'user' },
  listing_posted: { label: 'Posted', tone: 'lilac', icon: 'plus' },
  swiped_left: { label: 'Swiped left', tone: 'neutral', icon: 'x' },
  saved: { label: 'Saved', tone: 'green', icon: 'heart' },
  unsaved: { label: 'Unsaved', tone: 'neutral', icon: 'heart' },
  offer_made: { label: 'Offered', tone: 'green', icon: 'dollar' },
  offer_countered: { label: 'Countered', tone: 'amber', icon: 'dollar' },
  offer_accepted: { label: 'Accepted an offer', tone: 'green', icon: 'check' },
  offer_declined: { label: 'Declined an offer', tone: 'neutral', icon: 'x' },
  chat_opened: { label: 'Chat opened', tone: 'sky', icon: 'chat' },
  message_sent: { label: 'Messaged', tone: 'sky', icon: 'chat' },
  meetup_set: { label: 'Meetup set', tone: 'sky', icon: 'pin' },
  meetup_confirmed: { label: 'Meetup confirmed', tone: 'sky', icon: 'pin' },
  meetup_checked_in: { label: 'Checked in', tone: 'sky', icon: 'pin' },
  meetup_no_show: { label: 'No-show', tone: 'red', icon: 'flag' },
  deal_done: { label: 'Deal done', tone: 'green', icon: 'check' },
  listing_viewed: { label: 'Viewed', tone: 'neutral', icon: 'eye' },
  searched: { label: 'Searched', tone: 'neutral', icon: 'search' },
  opened_from: { label: 'Opened from a link', tone: 'neutral', icon: 'ext' },
  app_open: { label: 'Opened the app', tone: 'neutral', icon: 'home' },
  deck_shown: { label: 'Shown in deck', tone: 'neutral', icon: 'eye' },
};
export const eventKind = (v: string | null | undefined): EventStyle =>
  (v && EVENTS[v]) || { label: humanize(v), tone: 'neutral', icon: 'pulse' };

const cents = (v: unknown) =>
  typeof v === 'number' ? `$${(v / 100).toFixed(v % 100 ? 2 : 0)}` : '';

/**
 * What a student did, as the words after their name in a feed row:
 * "offered $40 on", "saved", "searched "desk lamp"". The listing follows it.
 */
export function eventVerb(kind: string, details?: Record<string, unknown> | null): string {
  const d = details ?? {};
  switch (kind) {
    case 'signup':
      return 'joined';
    case 'listing_posted':
      return 'posted';
    case 'swiped_left':
      return 'swiped left on';
    case 'saved':
      return 'saved';
    case 'unsaved':
      return 'unsaved';
    case 'offer_made':
      return d.amount_cents !== undefined
        ? `offered ${cents(d.amount_cents)} on`
        : 'made an offer on';
    case 'offer_countered':
      return d.amount_cents !== undefined
        ? `countered at ${cents(d.amount_cents)} on`
        : 'countered on';
    case 'offer_accepted':
      return 'accepted an offer on';
    case 'offer_declined':
      return 'declined an offer on';
    case 'chat_opened':
      return 'started a chat about';
    case 'message_sent':
      return 'sent a message about';
    case 'meetup_set':
      return 'set a meetup for';
    case 'meetup_confirmed':
      return 'confirmed a meetup for';
    case 'meetup_checked_in':
      return 'checked in for';
    case 'meetup_no_show':
      return 'reported a no-show for';
    case 'deal_done':
      return 'finished a deal on';
    case 'listing_viewed':
      return 'viewed';
    case 'searched':
      return typeof d.query === 'string' && d.query ? `searched "${d.query}"` : 'searched';
    case 'opened_from':
      return 'opened a link to';
    case 'app_open':
      return 'opened the app';
    case 'deck_shown':
      return 'was shown';
    default:
      return humanize(kind).toLowerCase();
  }
}

/** Kind groups for the feed filter (Overview and Activity). */
export const FEED_FILTERS = [
  { id: 'all', label: 'All', kinds: null },
  { id: 'swipes', label: 'Swipes', kinds: ['swiped_left', 'saved', 'offer_made'] },
  {
    id: 'offers',
    label: 'Offers',
    kinds: ['offer_made', 'offer_countered', 'offer_accepted', 'offer_declined'],
  },
  { id: 'deals', label: 'Deals', kinds: ['deal_done', 'meetup_set', 'meetup_confirmed'] },
  { id: 'signups', label: 'Sign-ups', kinds: ['signup'] },
] as const;
export type FeedFilter = (typeof FEED_FILTERS)[number]['id'];

// ---------------------------------------------------------------------------
// Activity page type filter (grouped multi-select, API §4.1 kinds)

export const ACTIVITY_GROUPS = [
  {
    id: 'browsing',
    label: 'Browsing',
    kinds: ['listing_viewed', 'searched', 'opened_from', 'app_open', 'deck_shown'],
  },
  { id: 'swipes', label: 'Swipes', kinds: ['swiped_left', 'saved', 'unsaved'] },
  {
    id: 'offers',
    label: 'Offers and deals',
    kinds: ['offer_made', 'offer_countered', 'offer_accepted', 'offer_declined', 'deal_done'],
  },
  {
    id: 'chats',
    label: 'Chats and meetups',
    kinds: [
      'chat_opened',
      'message_sent',
      'meetup_set',
      'meetup_confirmed',
      'meetup_checked_in',
      'meetup_no_show',
    ],
  },
  { id: 'listings', label: 'Listings', kinds: ['listing_posted'] },
  { id: 'signups', label: 'Sign-ups', kinds: ['signup'] },
] as const;

/** Where a listing was opened from (activity_events.source). */
const SOURCES: Record<string, string> = {
  discover: 'Discover',
  search: 'search',
  campus: 'Around campus',
  profile: 'a profile',
  saved: 'Saved',
  link: 'a shared link',
  notification: 'a notification',
};
export const viewSource = (v: string | null | undefined) => (v ? (SOURCES[v] ?? humanize(v)) : '');

/** "9 s", "1 min 5 s" for time on a card or page. */
export function dwellLabel(ms: unknown): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
}

/** The Details column of an activity row: amounts, places, time on card. Never message text. */
export function eventDetails(kind: string, details?: Record<string, unknown> | null): string {
  const d = details ?? {};
  const parts: string[] = [];
  switch (kind) {
    case 'offer_made':
    case 'offer_countered':
    case 'offer_accepted':
    case 'offer_declined':
      if (typeof d.amount_cents === 'number') parts.push(cents(d.amount_cents));
      if (typeof d.asking_cents === 'number') parts.push(`asking ${cents(d.asking_cents)}`);
      if (typeof d.round === 'number' && d.round > 1) parts.push(`round ${d.round}`);
      if (kind === 'offer_made' && typeof d.status === 'string' && d.status !== 'pending')
        parts.push(offerStatus(d.status).label.toLowerCase());
      break;
    case 'deal_done':
      if (typeof d.agreed_cents === 'number') parts.push(`${cents(d.agreed_cents)} in person`);
      if (typeof d.asking_cents === 'number' && d.asking_cents !== d.agreed_cents)
        parts.push(`asking ${cents(d.asking_cents)}`);
      break;
    case 'chat_opened':
      if (typeof d.agreed_cents === 'number') parts.push(`agreed ${cents(d.agreed_cents)}`);
      break;
    case 'message_sent':
      parts.push(d.message_kind === 'photo' ? 'photo (locked)' : 'text locked');
      break;
    case 'meetup_set':
    case 'meetup_confirmed':
    case 'meetup_checked_in':
      if (typeof d.place === 'string' && d.place) parts.push(d.place);
      break;
    case 'meetup_no_show':
      if (typeof d.status === 'string') parts.push(`report ${humanize(d.status).toLowerCase()}`);
      break;
    case 'listing_posted':
      if (typeof d.price_cents === 'number')
        parts.push(d.price_cents ? cents(d.price_cents) : 'Free');
      break;
    case 'saved':
      if (typeof d.price_at_save === 'number') parts.push(`at ${cents(d.price_at_save)}`);
      break;
    case 'signup':
      if (typeof d.year === 'string') parts.push(classYear(d.year));
      break;
    default:
      break;
  }
  if (typeof d.source === 'string' && d.source) parts.push(`from ${viewSource(d.source)}`);
  const dwell = dwellLabel(d.dwell_ms);
  if (dwell) parts.push(`${dwell} on ${kind === 'listing_viewed' ? 'the page' : 'the card'}`);
  if (kind === 'app_open' && typeof d.app_version === 'string') parts.push(`v${d.app_version}`);
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Offers, chats, meetups, listings detail

const OFFER_STATUSES: Record<string, Labeled> = {
  pending: { label: 'Waiting', tone: 'amber' },
  countered: { label: 'Countered', tone: 'amber' },
  accepted: { label: 'Accepted', tone: 'green' },
  declined: { label: 'Declined', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  auto_declined: { label: 'Sold to someone else', tone: 'neutral' },
};
export const offerStatus = (v: string | null | undefined) => pick(OFFER_STATUSES, v);

const CHAT_STATUSES: Record<string, Labeled> = {
  open: { label: 'Open', tone: 'green' },
  closed: { label: 'Closed', tone: 'neutral' },
  blocked: { label: 'Blocked', tone: 'red' },
};
export const chatStatus = (v: string | null | undefined) => pick(CHAT_STATUSES, v);

const MEETUP_STATUSES: Record<string, Labeled> = {
  proposed: { label: 'Suggested', tone: 'amber' },
  confirmed: { label: 'Confirmed', tone: 'sky' },
  completed: { label: 'Done', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  no_show: { label: 'No-show', tone: 'red' },
};
export const meetupStatus = (v: string | null | undefined) => pick(MEETUP_STATUSES, v);

/** Meetup pill with check-ins: "Checked in" once both are there. */
export function meetupPill(m: {
  status: string;
  buyer_here_at?: string | null;
  seller_here_at?: string | null;
  no_show_reports?: number;
}): Labeled {
  if (m.no_show_reports) return { label: 'No-show reported', tone: 'red' };
  if (m.status === 'confirmed' && m.buyer_here_at && m.seller_here_at)
    return { label: 'Checked in', tone: 'green' };
  if (m.status === 'confirmed' && (m.buyer_here_at || m.seller_here_at))
    return { label: 'One checked in', tone: 'sky' };
  return meetupStatus(m.status);
}

const CONDITIONS: Record<string, string> = {
  new: 'New',
  like_new: 'Like new',
  good: 'Good',
  fair: 'Fair',
};
export const condition = (v: string | null | undefined) =>
  v ? (CONDITIONS[v] ?? humanize(v)) : '';

const SWIPES: Record<string, EventStyle> = {
  offered: { label: 'Right (offer)', tone: 'green', icon: 'dollar' },
  saved: { label: 'Saved', tone: 'green', icon: 'heart' },
  left: { label: 'Swiped left', tone: 'neutral', icon: 'x' },
};
export const swipeDirection = (v: string | null | undefined): EventStyle =>
  (v && SWIPES[v]) || { label: humanize(v), tone: 'neutral', icon: 'pulse' };

// ---------------------------------------------------------------------------
// Support, deletions, exports, scheduled jobs

const SUPPORT_STATUSES: Record<string, Labeled> = {
  open: { label: 'Open', tone: 'amber' },
  answered: { label: 'Answered', tone: 'sky' },
  closed: { label: 'Closed', tone: 'neutral' },
};
export const supportStatus = (v: string | null | undefined) => pick(SUPPORT_STATUSES, v);

const SUPPORT_TOPICS: Record<string, string> = {
  general: 'General question',
  cant_access_email: "Can't get into school email",
  safety: 'Safety',
  bug: 'Something is broken',
  other: 'Other',
};
export const supportTopic = (v: string | null | undefined) =>
  v ? (SUPPORT_TOPICS[v] ?? humanize(v)) : '';

/** A deletion row: running, done, or stuck (still running after an hour). */
export function deletionStatus(d: { status: string; stuck?: boolean }): Labeled {
  if (d.stuck) return { label: 'Stuck', tone: 'red' };
  if (d.status === 'done') return { label: 'Done', tone: 'green' };
  if (d.status === 'started') return { label: 'Running', tone: 'amber' };
  return { label: humanize(d.status), tone: 'neutral' };
}

const EXPORT_STATUSES: Record<string, Labeled> = {
  queued: { label: 'Waiting', tone: 'amber' },
  running: { label: 'Running', tone: 'amber' },
  ready: { label: 'Done', tone: 'green' },
  done: { label: 'Done', tone: 'green' },
  sent: { label: 'Done', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  expired: { label: 'Link expired', tone: 'neutral' },
};
export const exportStatus = (v: string | null | undefined) => pick(EXPORT_STATUSES, v);

const CRON_STATUSES: Record<string, Labeled> = {
  succeeded: { label: 'OK', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  running: { label: 'Running', tone: 'sky' },
  starting: { label: 'Starting', tone: 'sky' },
};
export const cronStatus = (v: string | null | undefined): Labeled =>
  v ? pick(CRON_STATUSES, v) : { label: 'Not run yet', tone: 'neutral' };

const EMAIL_TEMPLATES: Record<string, string> = {
  campus_open: 'Campus open',
  account_paused: 'Account paused',
  reverify_due: 'Re-verify reminder',
  account_deleted: 'Account deleted',
  data_export: 'Data export',
  admin_reveal_receipt: 'Quad reveal receipt',
  support_request: 'Support request',
  priority_report: 'Urgent report alert',
  support_reply: 'Support reply',
  report_queue: 'Report queue alert',
};
export const emailTemplate = (v: string | null | undefined) =>
  v ? (EMAIL_TEMPLATES[v] ?? humanize(v)) : '';
