import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';

import type { FeedCursor } from '../feed/logic';
import type { CampusFilter, CampusPage } from './logic';

/** Around campus calls (P6-CAMP-01). Screens take an injected one in tests. */
export type CampusApi = {
  feed: (kind: CampusFilter, cursor: FeedCursor | null) => Promise<CampusPage>;
};

const rpc = createRpc(() => getSupabase() as unknown as RpcClient);

export const campusApi: CampusApi = {
  feed: (kind, cursor) => rpc<CampusPage>('get_campus_feed', { kind, cursor }),
};

export const campusKeys = {
  all: ['campus-feed'] as const,
  feed: (kind: CampusFilter) => ['campus-feed', kind] as const,
};
