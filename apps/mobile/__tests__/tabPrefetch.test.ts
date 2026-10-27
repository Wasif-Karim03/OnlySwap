import { QueryClient } from '@tanstack/react-query';

import { inboxKey } from '../src/features/offers/InboxScreen';
import { meKey } from '../src/features/me/MeScreens';
import { prefetchTabs } from '../src/features/me/useTabPrefetch';

describe('prefetchTabs', () => {
  it('fills the Profile and Inbox caches before the tabs open', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const apis = {
      me: { me: jest.fn(async () => ({ id: 'u1' })), listings: jest.fn(async () => []) },
      offers: { inbox: jest.fn(async () => ({ deals: [] })) },
    };

    await prefetchTabs(qc, apis as never);

    expect(qc.getQueryData(meKey)).toEqual({ id: 'u1' });
    expect(qc.getQueryData(['my-listings'])).toEqual([]);
    expect(qc.getQueryData(inboxKey)).toEqual({ deals: [] });
  });

  it('a failed prefetch leaves the cache empty so the screen fetches itself', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const apis = {
      me: { me: jest.fn(async () => ({ id: 'u1' })), listings: jest.fn(async () => []) },
      offers: { inbox: jest.fn(async () => Promise.reject(new Error('offline'))) },
    };

    await expect(prefetchTabs(qc, apis as never)).resolves.toBeDefined();

    expect(qc.getQueryData(inboxKey)).toBeUndefined();
    expect(qc.getQueryData(meKey)).toEqual({ id: 'u1' });
  });
});
