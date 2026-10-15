import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';

import type { FeedCursor } from '../feed/logic';
import type { PostedListing } from '../sell/api';
import type { CampusFilter, CampusPage, CreateNewsArgs } from './logic';

/** Around campus calls (P6-CAMP-01). Screens take an injected one in tests. */
export type CampusApi = {
  feed: (kind: CampusFilter, cursor: FeedCursor | null) => Promise<CampusPage>;
};

const rpc = createRpc(() => getSupabase() as unknown as RpcClient);

export const campusApi: CampusApi = {
  feed: (kind, cursor) => rpc<CampusPage>('get_campus_feed', { kind, cursor }),
};

/** News posts (DEC 98): create_news on a reserved id. */
export type NewsApi = {
  createNews: (args: CreateNewsArgs) => Promise<PostedListing>;
};

export const newsApi: NewsApi = {
  createNews: (args) => rpc<PostedListing>('create_news', args),
};

export const campusKeys = {
  all: ['campus-feed'] as const,
  feed: (kind: CampusFilter) => ['campus-feed', kind] as const,
};
