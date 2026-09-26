/**
 * All user-facing copy for the mobile app (CLAUDE.md rule 8).
 * Voice: plain student tone, no em dashes, no emoji, verbs on buttons.
 *
 * Native permission strings live in `permissions.json` because `app.config.ts`
 * runs in plain Node at prebuild time and can only read JSON or JS.
 */

import permissionsJson from './permissions.json';

export const permissions: Readonly<{ camera: string; photos: string }> = permissionsJson;

export const tabs = {
  discover: 'Discover',
  sell: 'Sell',
  inbox: 'Inbox',
  profile: 'Profile',
} as const;

export const shell = {
  discoverTitle: 'Discover',
  sellTitle: 'Sell',
  inboxTitle: 'Inbox',
  profileTitle: 'Profile',
  comingSoon: 'This screen is being built.',
} as const;

/** Error copy keyed by ErrorCode (API §0 + client codes). */
export const errors = {
  NOT_AUTHENTICATED: 'Sign in to keep going.',
  NOT_ACTIVE: "Your account can't do that right now. Check your profile for details.",
  AGE_REQUIRED: 'Confirm you are 18 or older to keep going.',
  RULES_REQUIRED: 'Read and accept the community rules to keep going.',
  FORBIDDEN: "You don't have access to that.",
  NOT_FOUND: "We couldn't find that. It may have been removed.",
  INVALID: 'Something in the form needs a fix. Check the highlighted fields.',
  BANNED_TERM: "That text includes words that aren't allowed on OnlySwap.",
  RATE_LIMITED: "You're doing that a lot. Try again in a little while.",
  RATE_LIMITED_UNTIL: "You're doing that a lot. Try again after {time}.",
  OFFERS_PAUSED: 'Offers are paused on your account after a missed meetup.',
  LISTING_UNAVAILABLE: "This item isn't taking offers right now.",
  OFFER_NOT_PENDING: 'This offer changed. Pull to refresh.',
  ALREADY_REPORTED: "You've already reported this. We're on it.",
  ALREADY_APPEALED: "You've already sent an appeal. We'll get back to you.",
  MEETUP_WINDOW: "That can't be done at this point in the meetup.",
  CHAT_CLOSED: 'This chat is closed.',
  CHAT_BLOCKED: "You can't send messages in this chat.",
  NOT_ADMIN: 'Admins only.',
  SCHOOL_UNKNOWN: "We don't support that school email yet.",
  DOMAIN_BLOCKED: "That email domain can't be used. Use your school email.",
  AGE_BLOCKED: 'OnlySwap is for people 18 and older.',
  BANNED: 'This account has been removed from OnlySwap.',
  FEATURE_OFF: "That isn't available yet.",
  ERR_OFFLINE: "You're offline. Check your connection and try again.",
  SESSION_EXPIRED: 'Your session ended. Sign in again.',
  UNKNOWN: 'Something went wrong. Try again.',
} as const;

export const en = { permissions, tabs, shell, errors } as const;

export default en;
