import { useQuery, type InfiniteData, type QueryClient } from '@tanstack/react-query';

import {
  quadApi,
  type QuadApi,
  type QuadCursor,
  type QuadFeedPage,
  type QuadPost,
  type QuadReply,
  type QuadSort,
} from './api';

/** Query keys (CLAUDE.md naming: ['entity', id]). */
export const quadKeys = {
  all: ['quad'] as const,
  status: ['quad', 'status'] as const,
  feeds: ['quad', 'feed'] as const,
  feed: (sort: QuadSort) => ['quad', 'feed', sort] as const,
  thread: (id: string) => ['quad', 'thread', id] as const,
  mine: ['quad', 'mine'] as const,
  hides: ['quad', 'hides'] as const,
  mutes: ['quad', 'mutes'] as const,
  activity: ['quad', 'activity'] as const,
};

export type FeedData = InfiniteData<QuadFeedPage, QuadCursor | null>;
export type ThreadData = { post: QuadPost; replies: QuadReply[] };

/** Is the Quad on for this campus, and are the rules accepted (Q01 gate, tab visibility)? */
export function useQuadStatus(api: Pick<QuadApi, 'status'> = quadApi) {
  return useQuery({
    queryKey: quadKeys.status,
    queryFn: () => api.status(),
    staleTime: 5 * 60_000,
  });
}

/** Applies a change to one post everywhere it is cached (all feed sorts and its thread). */
export function patchPost(qc: QueryClient, id: string, fn: (p: QuadPost) => QuadPost): void {
  qc.setQueriesData<FeedData>({ queryKey: quadKeys.feeds }, (d) =>
    d
      ? {
          ...d,
          pages: d.pages.map((pg) => ({
            ...pg,
            items: pg.items.map((p) => (p.id === id ? fn(p) : p)),
          })),
        }
      : d,
  );
  qc.setQueryData<ThreadData>(quadKeys.thread(id), (d) => (d ? { ...d, post: fn(d.post) } : d));
}

export function patchReply(
  qc: QueryClient,
  postId: string,
  replyId: string,
  fn: (r: QuadReply) => QuadReply,
): void {
  qc.setQueryData<ThreadData>(quadKeys.thread(postId), (d) =>
    d ? { ...d, replies: d.replies.map((r) => (r.id === replyId ? fn(r) : r)) } : d,
  );
}

/** Drops a post from every cached feed (deleted by its author). */
export function dropPost(qc: QueryClient, id: string): void {
  qc.setQueriesData<FeedData>({ queryKey: quadKeys.feeds }, (d) =>
    d
      ? {
          ...d,
          pages: d.pages.map((pg) => ({ ...pg, items: pg.items.filter((p) => p.id !== id) })),
        }
      : d,
  );
}
