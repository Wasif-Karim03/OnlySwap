import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';

/**
 * Likes and comments on Feed posts (DEC 121; API Feed comments RPCs, 0233).
 * Screens take an injected api in tests.
 */

export type CommentSort = 'top' | 'new';
export type CommentStatus = 'live' | 'held' | 'removed' | 'deleted';
export type Cursor = Record<string, unknown> | null;

export type FeedComment = {
  id: string;
  listing_id: string;
  parent_id: string | null;
  /** null once deleted. */
  body: string | null;
  status: CommentStatus;
  created_at: string;
  /** null once deleted. */
  author: { id: string; display_name: string | null; avatar_path: string | null } | null;
  /** The post's own author wrote it. */
  is_author_of_post: boolean;
  like_count: number;
  liked: boolean;
  reply_count: number;
  is_own: boolean;
  can_delete: boolean;
  /** Top-level comments only: the first visible replies. */
  replies?: FeedComment[];
};

export type CommentsPage = {
  items: FeedComment[];
  next_cursor: Cursor;
  comment_count: number;
  like_count: number;
  liked: boolean;
  comments_enabled: boolean;
  can_comment: boolean;
  is_owner: boolean;
  title: string;
  kind: string;
};

export type RepliesPage = { items: FeedComment[]; next_cursor: Cursor };

export type CreateCommentResult = {
  status: 'live' | 'held' | 'blocked';
  reason: string | null;
  comment: FeedComment | null;
};

export type LikeResult = { like_count: number; liked: boolean };

export type CommentReportReason =
  | 'calls_out_student'
  | 'harassment'
  | 'threat'
  | 'hate'
  | 'sexual'
  | 'spam'
  | 'self_harm'
  | 'minor_safety'
  | 'other';

export type CommentsApi = {
  list: (listingId: string, sort: CommentSort, cursor: Cursor) => Promise<CommentsPage>;
  replies: (commentId: string, cursor: Cursor) => Promise<RepliesPage>;
  create: (input: {
    listingId: string;
    body: string;
    parentId: string | null;
    clientId: string;
  }) => Promise<CreateCommentResult>;
  likePost: (listingId: string, liked: boolean) => Promise<LikeResult>;
  likeComment: (commentId: string, liked: boolean) => Promise<LikeResult>;
  remove: (commentId: string) => Promise<void>;
  setEnabled: (listingId: string, enabled: boolean) => Promise<boolean>;
  report: (commentId: string, reason: CommentReportReason, details: string) => Promise<void>;
  block: (userId: string) => Promise<void>;
};

const rpc = createRpc(() => getSupabase() as unknown as RpcClient);

export const commentsApi: CommentsApi = {
  list: (listingId, sort, cursor) =>
    rpc('get_listing_comments', { listing_id: listingId, sort, cursor }),
  replies: (commentId, cursor) => rpc('get_comment_replies', { comment_id: commentId, cursor }),
  create: ({ listingId, body, parentId, clientId }) =>
    rpc('create_listing_comment', {
      listing_id: listingId,
      body,
      parent_id: parentId,
      client_id: clientId,
    }),
  likePost: (listingId, liked) => rpc('like_listing', { listing_id: listingId, liked }),
  likeComment: (commentId, liked) => rpc('like_listing_comment', { comment_id: commentId, liked }),
  remove: async (commentId) => {
    await rpc('delete_listing_comment', { comment_id: commentId });
  },
  setEnabled: async (listingId, enabled) => {
    const res = await rpc<{ comments_enabled: boolean }>('set_listing_comments', {
      listing_id: listingId,
      enabled,
    });
    return res.comments_enabled;
  },
  report: async (commentId, reason, details) => {
    await rpc('create_report', {
      target_type: 'listing_comment',
      target_id: commentId,
      reason,
      details: details || null,
    });
  },
  block: async (userId) => {
    await rpc('block_user', { user_id: userId });
  },
};
