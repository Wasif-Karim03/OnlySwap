import type { InfiniteData } from '@tanstack/react-query';

import { fill } from '@/lib/format';
import { comments as copy } from '@/strings';

import type { CommentSort, CommentsPage, FeedComment, LikeResult } from './api';

/** Server limit (0233). */
export const COMMENT_MAX = 500;

export const commentKeys = {
  all: ['comments'] as const,
  list: (listingId: string, sort: CommentSort) => ['comments', listingId, sort] as const,
  post: (listingId: string) => ['comments', listingId] as const,
};

export type LikeState = { liked: boolean; count: number };

/** One tap on Like: flips it and moves the count, never below zero. */
export function toggleLike(s: LikeState): LikeState {
  return { liked: !s.liked, count: Math.max(0, s.count + (s.liked ? -1 : 1)) };
}

/**
 * Sends like taps one at a time per target, and only the last choice: a fast
 * like-unlike-like ends in one "liked" on the server, never out of order.
 * onSettled gets the server's answer, or null when a call failed.
 */
export function createLikeSender(
  send: (id: string, liked: boolean) => Promise<LikeResult>,
  onSettled: (id: string, result: LikeResult | null) => void,
): (id: string, liked: boolean) => void {
  const want = new Map<string, boolean>();
  const busy = new Set<string>();
  return (id, liked) => {
    want.set(id, liked);
    if (busy.has(id)) return;
    busy.add(id);
    void (async () => {
      let sent: boolean | undefined;
      let last: LikeResult | null = null;
      try {
        while (want.get(id) !== sent) {
          sent = want.get(id)!;
          last = await send(id, sent);
        }
      } catch {
        last = null;
      } finally {
        busy.delete(id);
        want.delete(id);
      }
      onSettled(id, last);
    })();
  };
}

/** "1 like", "12 likes"; empty for zero so nothing shows. */
export function likesText(n: number): string {
  if (n <= 0) return '';
  return n === 1 ? copy.likeCount1 : fill(copy.likeCount, { n: String(n) });
}

export function commentsText(n: number): string {
  if (n <= 0) return '';
  return n === 1 ? copy.commentCount1 : fill(copy.commentCount, { n: String(n) });
}

/** Replies not on screen yet: what the "View n more replies" button opens. */
export function moreReplies(c: FeedComment, shown: number): number {
  return Math.max(0, c.reply_count - shown);
}

export function viewRepliesText(n: number): string {
  return n === 1 ? copy.viewReplies1 : fill(copy.viewReplies, { n: String(n) });
}

/**
 * Adds replies to the ones shown, skipping any already there, oldest first
 * (the server's order), so your own new reply and a loaded page sit in time.
 */
export function mergeReplies(shown: FeedComment[], more: FeedComment[]): FeedComment[] {
  const seen = new Set(shown.map((r) => r.id));
  return [...shown, ...more.filter((r) => !seen.has(r.id))].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}

/** Why the server refused a comment, as the line to show. */
export function blockedText(reason: string | null): string {
  const r = reason ?? '';
  if (r.startsWith('term:')) return fill(copy.blocked.term, { term: r.slice(5) });
  const key = r.startsWith('pii:') ? r.slice(4) : r;
  return key === 'phone' || key === 'email' || key === 'url' || key === 'handle' || key === 'room'
    ? copy.blocked[key]
    : copy.blocked.other;
}

type Data = InfiniteData<CommentsPage>;

function mapPages(data: Data, fn: (p: CommentsPage, i: number) => CommentsPage): Data {
  return { ...data, pages: data.pages.map(fn) };
}

/** Changes one comment wherever it is: a top-level comment or a reply. */
export function patchComment(data: Data, id: string, fn: (c: FeedComment) => FeedComment): Data {
  return mapPages(data, (p) => ({
    ...p,
    items: p.items.map((c) =>
      c.id === id
        ? fn(c)
        : c.replies?.some((r) => r.id === id)
          ? { ...c, replies: c.replies.map((r) => (r.id === id ? fn(r) : r)) }
          : c,
    ),
  }));
}

/** A new top-level comment goes first; a live one adds to the post's count. */
export function addComment(data: Data, c: FeedComment): Data {
  return mapPages(data, (p, i) =>
    i === 0
      ? {
          ...p,
          items: [{ ...c, replies: c.replies ?? [] }, ...p.items.filter((x) => x.id !== c.id)],
          comment_count: p.comment_count + (c.status === 'live' ? 1 : 0),
        }
      : p,
  );
}

/** A new reply goes under its comment, after the replies shown. */
export function addReply(data: Data, parentId: string, r: FeedComment): Data {
  const live = r.status === 'live' ? 1 : 0;
  return mapPages(data, (p, i) => ({
    ...p,
    comment_count: p.comment_count + (i === 0 ? live : 0),
    items: p.items.map((c) =>
      c.id === parentId
        ? {
            ...c,
            reply_count: c.reply_count + live,
            replies: mergeReplies(c.replies ?? [], [r]),
          }
        : c,
    ),
  }));
}

/**
 * A deleted comment: a reply leaves its thread; a top-level comment with
 * replies stays as "Comment deleted" (as the server returns it); one without
 * replies leaves the list.
 */
export function removeComment(data: Data, id: string): Data {
  let counted = 0;
  const next = mapPages(data, (p) => ({
    ...p,
    items: p.items.flatMap((c) => {
      if (c.id === id) {
        if (c.status === 'live') counted = 1;
        if (c.reply_count > 0) {
          return [
            {
              ...c,
              body: null,
              author: null,
              status: 'deleted' as const,
              liked: false,
              like_count: 0,
              can_delete: false,
            },
          ];
        }
        return [];
      }
      const hit = c.replies?.find((r) => r.id === id);
      if (!hit) return [c];
      if (hit.status === 'live') counted = 1;
      return [
        {
          ...c,
          reply_count: Math.max(0, c.reply_count - (hit.status === 'live' ? 1 : 0)),
          replies: c.replies!.filter((r) => r.id !== id),
        },
      ];
    }),
  }));
  return mapPages(next, (p, i) =>
    i === 0 ? { ...p, comment_count: Math.max(0, p.comment_count - counted) } : p,
  );
}

/** Every top-level comment across the loaded pages. */
export function allComments(data: Data | undefined): FeedComment[] {
  const seen = new Set<string>();
  const out: FeedComment[] = [];
  for (const p of data?.pages ?? []) {
    for (const c of p.items) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        out.push(c);
      }
    }
  }
  return out;
}
