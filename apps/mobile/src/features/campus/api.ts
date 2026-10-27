import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';
import { uuid } from '@/lib/uuid';

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

/** Need it by and alert me on a Wanted post (DEC 127), set right after posting. */
export type WantedPrefsApi = {
  setWantedPrefs: (id: string, needBy: string | null, alerts: boolean) => Promise<void>;
};

export const wantedPrefsApi: WantedPrefsApi = {
  setWantedPrefs: async (id, needBy, alerts) => {
    await rpc('set_wanted_prefs', { id, need_by: needBy, alerts });
  },
};

/**
 * "I have this" (DEC 149): opens a chat with the person who asked, with
 * "I have this" as the first message. Answering again opens the same chat.
 */
export type WantedChatApi = {
  start: (wantedId: string, body: string) => Promise<{ chat_id: string; existing: boolean }>;
};

export const wantedChatApi: WantedChatApi = {
  start: (wantedId, body) =>
    rpc('start_wanted_chat', { wanted_id: wantedId, body, client_id: uuid() }),
};

export const campusKeys = {
  all: ['campus-feed'] as const,
  feed: (kind: CampusFilter) => ['campus-feed', kind] as const,
};
