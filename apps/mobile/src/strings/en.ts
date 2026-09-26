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

export const en = { permissions, tabs, shell } as const;

export default en;
