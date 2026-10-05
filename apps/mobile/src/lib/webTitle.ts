import { usePathname } from 'expo-router';
import { useEffect } from 'react';

import { web as copy } from '@/strings';

import { isWebPlatform } from './platform';

type TitleKey = keyof typeof copy.titles;

/** First path segment (route groups are already gone from the pathname) → page. */
const BY_SEGMENT: Record<string, TitleKey> = {
  welcome: 'signIn',
  email: 'signIn',
  verify: 'signIn',
  age: 'signIn',
  'profile-setup': 'signIn',
  rules: 'signIn',
  discover: 'discover',
  search: 'search',
  saved: 'saved',
  listing: 'listing',
  inbox: 'inbox',
  chat: 'chat',
  offer: 'chat',
  deal: 'chat',
  sell: 'sell',
  profile: 'profile',
  user: 'profile',
  settings: 'settings',
  notifications: 'notifications',
  quad: 'quad',
  meetup: 'meetup',
  safety: 'safety',
  report: 'safety',
  help: 'help',
};

/**
 * Browser tab title for a route (P13-WEB-07): "<page> | OnlySwap", or just
 * "OnlySwap" for routes without a page name (launch, system screens).
 */
export function titleForPath(pathname: string): string {
  const parts = pathname.split('?')[0]!.split('/').filter(Boolean);
  const [first, , third] = parts;
  let key: TitleKey | undefined = first ? BY_SEGMENT[first] : undefined;
  // /listing/{id}/offer is the make-an-offer sheet.
  if (first === 'listing' && third === 'offer') key = 'offer';
  return key ? `${copy.titles[key]} | ${copy.appName}` : copy.appName;
}

/** Root layout: keeps `document.title` in step with the route on web; no-op on phones. */
export function useWebTitle(): void {
  const pathname = usePathname();
  useEffect(() => {
    if (!isWebPlatform() || typeof document === 'undefined') return;
    document.title = titleForPath(pathname);
  }, [pathname]);
}
