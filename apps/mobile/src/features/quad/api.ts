import { toAppError } from '@/lib/errors';
import { processPhoto, uploadPhotos, xhrPut, type PickedPhoto, type UploadFile } from '@/lib/media';
import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';
import { uploadApi } from '@/lib/uploadApi';

import type { AppNotification } from '../notifications/api';

/**
 * Quad calls (P10-QUAD-02..07; API Quad RPCs, migration 0200). Nothing here
 * ever carries an author: the server answers with `is_mine` and per-thread
 * alias numbers only (SECURITY T12). Screens take an injected api in tests.
 */

export type QuadSort = 'hot' | 'new' | 'top';
export type QuadKind = 'text' | 'photo' | 'poll' | 'checkin';
export type QuadStatus = 'live' | 'held' | 'hidden' | 'removed';
export type VoteValue = -1 | 0 | 1;

export type QuadPoll = {
  options: { id: string; label: string; votes: number }[];
  total: number;
  my_option: string | null;
};

export type QuadPost = {
  id: string;
  kind: QuadKind;
  body: string;
  photo_path: string | null;
  place: string | null;
  score: number;
  reply_count: number;
  status: QuadStatus;
  replies_enabled: boolean;
  expires_at: string | null;
  created_at: string;
  is_mine: boolean;
  my_vote: VoteValue;
  poll: QuadPoll | null;
};

export type QuadReply = {
  id: string;
  body: string;
  alias_no: number;
  is_op: boolean;
  is_mine: boolean;
  score: number;
  status: QuadStatus;
  created_at: string;
  my_vote: VoteValue;
};

export type MyQuadReply = QuadReply & { post_id: string; post_excerpt: string };

export type QuadPinned = { id: string; type: string; title: string; body: string };

export type QuadCursor = { offset: number };

export type QuadFeedPage = {
  items: QuadPost[];
  next_cursor: QuadCursor | null;
  pinned: QuadPinned | null;
};

export type QuadOutcome = {
  id: string | null;
  status: 'live' | 'held' | 'blocked';
  reason: string | null;
};

export type QuadReplyOutcome = QuadOutcome & { alias_no?: number | null };

export type NewQuadPost = {
  kind: QuadKind;
  body: string;
  photo_path?: string | null;
  poll?: { options: string[] } | null;
  place?: string | null;
  post_id?: string | null;
};

export type QuadHide = { source_post_id: string; excerpt: string; created_at: string };

export type QuadReportReason =
  | 'calls_out_student'
  | 'harassment'
  | 'threat'
  | 'hate'
  | 'sexual'
  | 'spam'
  | 'self_harm'
  | 'other';

export type QuadApi = {
  status: () => Promise<{ enabled: boolean; rules_accepted: boolean }>;
  acceptRules: () => Promise<void>;
  feed: (sort: QuadSort, cursor: QuadCursor | null) => Promise<QuadFeedPage>;
  thread: (postId: string) => Promise<{ post: QuadPost; replies: QuadReply[] }>;
  createPost: (input: NewQuadPost) => Promise<QuadOutcome>;
  createReply: (postId: string, body: string) => Promise<QuadReplyOutcome>;
  vote: (
    targetType: 'post' | 'reply',
    targetId: string,
    value: VoteValue,
  ) => Promise<{ score: number; my_vote: VoteValue }>;
  votePoll: (postId: string, optionId: string) => Promise<QuadPoll>;
  hideAuthor: (postId: string) => Promise<void>;
  unhide: (sourcePostId: string) => Promise<void>;
  hides: () => Promise<QuadHide[]>;
  mute: (keyword: string) => Promise<void>;
  unmute: (keyword: string) => Promise<void>;
  mutes: () => Promise<string[]>;
  setReplies: (postId: string, enabled: boolean) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  mine: () => Promise<{ posts: QuadPost[]; replies: MyQuadReply[] }>;
  report: (
    targetType: 'quad_post' | 'quad_reply',
    targetId: string,
    reason: QuadReportReason,
    details: string,
  ) => Promise<void>;
  /** create_appeal('quad_post', ...) for a held, hidden or removed post (Q12). */
  appeal: (postId: string, reason: string, body: string) => Promise<void>;
  /** Uploads one photo (no EXIF, WebP) under the new post's id; resolves with the full key. */
  uploadPhoto: (
    postId: string,
    photo: PickedPhoto,
    onProgress: (fraction: number) => void,
  ) => Promise<string>;
  /** One page of notifications (the Activity screen keeps the `quad` group). */
  notifications: (cursor: number | null) => Promise<{ items: AppNotification[]; unread: number }>;
  markRead: (ids: number[]) => Promise<void>;
};

const rpc = createRpc(() => getSupabase() as unknown as RpcClient);

export const quadApi: QuadApi = {
  status: () => rpc('get_quad_status'),
  acceptRules: async () => {
    await rpc('accept_quad_rules');
  },
  feed: (sort, cursor) => rpc('get_quad_feed', { sort, cursor }),
  thread: (postId) => rpc('get_quad_thread', { post_id: postId }),
  createPost: (input) =>
    rpc('create_quad_post', {
      kind: input.kind,
      body: input.body,
      photo_path: input.photo_path ?? null,
      poll: input.poll ?? null,
      place: input.place ?? null,
      post_id: input.post_id ?? null,
    }),
  createReply: (postId, body) => rpc('create_quad_reply', { post_id: postId, body }),
  vote: (targetType, targetId, value) =>
    rpc('vote_quad', { target_type: targetType, target_id: targetId, value }),
  votePoll: (postId, optionId) => rpc('vote_poll', { post_id: postId, option_id: optionId }),
  hideAuthor: async (postId) => {
    await rpc('hide_quad_author', { post_id: postId });
  },
  unhide: async (sourcePostId) => {
    await rpc('unhide_quad', { source_post_id: sourcePostId });
  },
  hides: () => rpc('get_my_quad_hides'),
  mute: async (keyword) => {
    await rpc('mute_keyword', { keyword });
  },
  unmute: async (keyword) => {
    await rpc('unmute_keyword', { keyword });
  },
  mutes: () => rpc('get_my_quad_mutes'),
  setReplies: async (postId, enabled) => {
    await rpc('set_quad_replies', { post_id: postId, enabled });
  },
  deletePost: async (postId) => {
    await rpc('delete_quad_post', { post_id: postId });
  },
  mine: () => rpc('get_my_quad'),
  report: async (targetType, targetId, reason, details) => {
    await rpc('create_report', {
      target_type: targetType,
      target_id: targetId,
      reason,
      details: details || null,
    });
  },
  appeal: async (postId, reason, body) => {
    await rpc('create_appeal', {
      subject_type: 'quad_post',
      subject_id: postId,
      reason_choice: reason,
      body: body.trim() || null,
    });
  },
  uploadPhoto: async (postId, photo, onProgress) => {
    const encoded = await processPhoto(photo, 'listing');
    if (!encoded.thumb) throw toAppError({ message: 'no thumbnail' });
    const files: UploadFile[] = [
      { idx: 0, variant: 'full', uri: encoded.full.uri, size: encoded.full.size },
      { idx: 0, variant: 'thumb', uri: encoded.thumb.uri, size: encoded.thumb.size },
    ];
    const targets = await uploadPhotos(
      files,
      { requestUrls: (f) => uploadApi.requestUrls('quad', postId, f), put: xhrPut },
      onProgress,
    );
    const full = targets.find((t) => t.variant === 'full')?.key;
    if (!full) throw toAppError({ message: 'upload-url returned no keys' });
    return full;
  },
  notifications: (cursor) => rpc('get_notifications', { cursor, limit: 30 }),
  markRead: async (ids) => {
    await rpc('mark_notifications_read', { ids });
  },
};
