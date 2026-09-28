import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';

import type { FeedItem } from '../feed/logic';
import type { SavedSearch, SearchFilters, Suggestion } from './logic';

/** Search and saved-search calls (P6-SRCH-01). */
export type SearchApi = {
  search: (q: string, filters: SearchFilters, offset: number) => Promise<FeedItem[]>;
  suggest: (q: string) => Promise<Suggestion[]>;
  saveSearch: (q: string, filters: SearchFilters) => Promise<SavedSearch>;
  listSaved: () => Promise<SavedSearch[]>;
  updateSaved: (id: string, patch: { alerts?: boolean; seen?: boolean }) => Promise<SavedSearch>;
  deleteSaved: (id: string) => Promise<void>;
  newCounts: () => Promise<{ id: string; new_count: number }[]>;
};

const rpc = createRpc(() => getSupabase() as unknown as RpcClient);

export const searchApi: SearchApi = {
  search: (q, filters, offset) =>
    rpc<FeedItem[]>('search_listings', {
      q: q || null,
      filters,
      cursor: offset ? { offset } : null,
    }),
  suggest: (q) => rpc<Suggestion[]>('search_suggest', { q }),
  saveSearch: (q, filters) =>
    rpc<SavedSearch>('create_saved_search', { query: q || null, filters }),
  listSaved: () => rpc<SavedSearch[]>('list_saved_searches'),
  updateSaved: (id, patch) =>
    rpc<SavedSearch>('update_saved_search', {
      id,
      alerts: patch.alerts ?? null,
      seen: patch.seen ?? false,
    }),
  deleteSaved: async (id) => {
    await rpc('delete_saved_search', { id });
  },
  newCounts: () => rpc<{ id: string; new_count: number }[]>('saved_search_new_counts'),
};
