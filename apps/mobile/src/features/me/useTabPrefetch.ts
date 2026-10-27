import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { offersApi, type OffersApi } from '../offers/api';
import { inboxKey } from '../offers/InboxScreen';
import { meApi, type MeApi } from './api';
import { meKey } from './MeScreens';

type Apis = { me: Pick<MeApi, 'me' | 'listings'>; offers: Pick<OffersApi, 'inbox'> };

/**
 * Warms the lists behind the Profile and Inbox tabs once the signed-in area
 * mounts, so a first tab switch shows data instead of a skeleton (owner
 * testing: tab switches waited on their lists). Failures are left to the
 * screens, which fetch again and show their own error state.
 */
export function prefetchTabs(
  qc: QueryClient,
  apis: Apis = { me: meApi, offers: offersApi },
): Promise<unknown> {
  return Promise.all([
    qc.prefetchQuery({ queryKey: meKey, queryFn: () => apis.me.me() }),
    qc.prefetchQuery({ queryKey: ['my-listings'], queryFn: () => apis.me.listings() }),
    qc.prefetchQuery({ queryKey: inboxKey, queryFn: () => apis.offers.inbox() }),
  ]);
}

/** Long enough for Discover's first page, short enough to beat a tab switch. */
export const TAB_PREFETCH_DELAY_MS = 1500;

export function useTabPrefetch(): void {
  const qc = useQueryClient();
  useEffect(() => {
    // After a short wait, so Discover's first cards have the network and the
    // JS thread to themselves on a cold start (the app opens on Discover).
    const t = setTimeout(() => void prefetchTabs(qc), TAB_PREFETCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [qc]);
}
