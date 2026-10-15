import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import { campusKeys } from '../campus/api';
import type { CampusItem, CampusPage } from '../campus/logic';

/**
 * Puts a post's like and comment numbers on every cached Feed filter, so the
 * Feed matches the comments screen without reloading every page (E-20).
 */
export function patchFeedPost(
  qc: QueryClient,
  id: string,
  patch: Partial<Pick<CampusItem, 'liked' | 'like_count' | 'comment_count' | 'comments_enabled'>>,
) {
  qc.setQueriesData<InfiniteData<CampusPage>>({ queryKey: campusKeys.all }, (old) =>
    old
      ? {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            items: p.items.map((x) => (x.id === id ? { ...x, ...patch } : x)),
          })),
        }
      : old,
  );
}
