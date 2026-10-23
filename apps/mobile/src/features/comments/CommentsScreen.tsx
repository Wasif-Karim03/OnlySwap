import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { Chip } from '@/components/Chip';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/icons/Icon';
import { IconButton } from '@/components/IconButton';
import { NavBar } from '@/components/NavBar';
import { ReportSheet } from '@/components/ReportSheet';
import { ActionSheet } from '@/components/Sheet';
import { SkeletonList } from '@/components/Skeleton';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { useToastStore } from '@/components/Toast';
import { track } from '@/lib/analytics';
import { getEnv } from '@/lib/env';
import { errorText, toAppError } from '@/lib/errors';
import { fill } from '@/lib/format';
import { uuid } from '@/lib/uuid';
import { comments as copy } from '@/strings';

import { agoLabel } from '../feed/logic';
import { mediaUrl } from '../sell/logic';
import {
  commentsApi,
  type CommentReportReason,
  type CommentSort,
  type CommentsApi,
  type CommentsPage,
  type Cursor,
  type FeedComment,
} from './api';
import { patchFeedPost } from './cache';
import { CommentRow } from './components/CommentRow';
import {
  addComment,
  addReply,
  allComments,
  blockedText,
  COMMENT_MAX,
  commentKeys,
  createLikeSender,
  likesText,
  mergeReplies,
  moreReplies,
  patchComment,
  removeComment,
  toggleLike,
  viewRepliesText,
} from './logic';
import { a11yState } from '@/lib/a11y';

type Data = InfiniteData<CommentsPage>;
type ReplyTo = { parentId: string; name: string };

function toast(kind: 'info' | 'success' | 'error', message: string) {
  useToastStore.getState().show(kind, message);
}

/**
 * Comments on a Feed post (DEC 121), Facebook style: top comments first (or
 * newest), one level of replies under each with "View n more replies", Like
 * and Reply under every comment, a composer that rides the keyboard with a
 * "Replying to" bar. Long press a comment for Copy, Delete or Report. The
 * post's author can turn comments off from the top right.
 */
export function CommentsScreen({
  listingId,
  api = commentsApi,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  now = () => new Date(),
}: {
  listingId: string;
  api?: CommentsApi;
  mediaBase?: () => string;
  now?: () => Date;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { theme } = useUnistyles();
  const [sort, setSort] = useState<CommentSort>('top');
  const key = commentKeys.list(listingId, sort);
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api.list(listingId, sort, pageParam),
    initialPageParam: null as Record<string, unknown> | null,
    getNextPageParam: (last: CommentsPage) => last.next_cursor ?? undefined,
  });
  const input = useRef<TextInput>(null);
  const clientId = useRef<string | null>(null);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [options, setOptions] = useState<FeedComment | null>(null);
  const [postMenu, setPostMenu] = useState(false);
  const [reporting, setReporting] = useState<FeedComment | null>(null);
  const [deleting, setDeleting] = useState<FeedComment | null>(null);
  const [loadingReplies, setLoadingReplies] = useState<Set<string>>(new Set());
  // Where each thread's next page of replies starts. The first "View more"
  // starts at the top: a reply you just sent is newer than the ones skipped.
  const replyCursors = useRef(new Map<string, Cursor>());

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/feed'));
  const openPost = () =>
    router.push({ pathname: '/listing/[id]', params: { id: listingId, from: 'comments' } });
  const patch = (fn: (d: Data) => Data) =>
    qc.setQueryData<Data>(key, (old) => (old ? fn(old) : old));
  const patchFirst = (fn: (p: CommentsPage) => CommentsPage) =>
    patch((d) => ({ ...d, pages: d.pages.map((p, i) => (i === 0 ? fn(p) : p)) }));
  const first = q.data?.pages[0];
  const refetchAll = () => void qc.invalidateQueries({ queryKey: commentKeys.post(listingId) });

  // Likes show at once; one call per target in flight, the server's count wins.
  const commentLikes = useRef(
    createLikeSender(
      (id, liked) => api.likeComment(id, liked),
      (id, res) => {
        if (res) patch((d) => patchComment(d, id, (c) => ({ ...c, ...res })));
        else {
          toast('error', copy.likeFailed);
          refetchAll();
        }
      },
    ),
  ).current;
  const postLikes = useRef(
    createLikeSender(
      (id, liked) => api.likePost(id, liked),
      (id, res) => {
        if (res) {
          patchFirst((p) => ({ ...p, liked: res.liked, like_count: res.like_count }));
          patchFeedPost(qc, id, { liked: res.liked, like_count: res.like_count });
        } else {
          toast('error', copy.likeFailed);
          refetchAll();
        }
      },
    ),
  ).current;

  const likeComment = (c: FeedComment) => {
    if (c.status !== 'live') return;
    const next = toggleLike({ liked: c.liked, count: c.like_count });
    patch((d) =>
      patchComment(d, c.id, (x) => ({ ...x, liked: next.liked, like_count: next.count })),
    );
    commentLikes(c.id, next.liked);
  };
  const likePost = () => {
    if (!first) return;
    const next = toggleLike({ liked: first.liked, count: first.like_count });
    patchFirst((p) => ({ ...p, liked: next.liked, like_count: next.count }));
    patchFeedPost(qc, listingId, { liked: next.liked, like_count: next.count });
    postLikes(listingId, next.liked);
  };

  // A reply to a reply joins the same thread on the server (one level).
  const startReply = (c: FeedComment) => {
    setReplyTo({ parentId: c.id, name: c.author?.display_name ?? '' });
    setNotice(null);
    input.current?.focus();
  };

  const loadReplies = async (top: FeedComment) => {
    if (loadingReplies.has(top.id)) return;
    setLoadingReplies((s) => new Set(s).add(top.id));
    try {
      const page = await api.replies(top.id, replyCursors.current.get(top.id) ?? null);
      if (page.next_cursor) replyCursors.current.set(top.id, page.next_cursor);
      patch((d) =>
        patchComment(d, top.id, (c) => ({
          ...c,
          replies: mergeReplies(c.replies ?? [], page.items),
        })),
      );
    } catch (e) {
      toast('error', errorText(e));
    } finally {
      setLoadingReplies((s) => {
        const n = new Set(s);
        n.delete(top.id);
        return n;
      });
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setNotice(null);
    // One id per comment typed: a retry after a dropped connection returns
    // the first result instead of posting twice.
    clientId.current ??= uuid();
    try {
      const res = await api.create({
        listingId,
        body,
        parentId: replyTo?.parentId ?? null,
        clientId: clientId.current,
      });
      if (res.status === 'blocked') {
        clientId.current = null;
        setNotice(blockedText(res.reason));
        return;
      }
      clientId.current = null;
      setText('');
      setReplyTo(null);
      const c = res.comment;
      if (c) {
        // Both sorts hold the new comment, so switching sort shows it too.
        for (const s of ['top', 'new'] as const) {
          qc.setQueryData<Data>(commentKeys.list(listingId, s), (old) =>
            old ? (c.parent_id ? addReply(old, c.parent_id, c) : addComment(old, c)) : old,
          );
        }
        const count = qc.getQueryData<Data>(key)?.pages[0]?.comment_count;
        if (count !== undefined) patchFeedPost(qc, listingId, { comment_count: count });
      }
      if (res.status === 'held') toast('info', copy.heldToast);
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'FORBIDDEN' || err.code === 'NOT_FOUND') refetchAll();
      toast('error', errorText(e));
    } finally {
      setSending(false);
    }
  };

  const setEnabled = async (enabled: boolean) => {
    try {
      const on = await api.setEnabled(listingId, enabled);
      // The refetch below brings back can_comment for a post turned back on.
      patchFirst((p) => ({ ...p, comments_enabled: on, can_comment: on && p.can_comment }));
      patchFeedPost(qc, listingId, { comments_enabled: on });
      refetchAll();
      toast('info', on ? copy.turnedOn : copy.turnedOff);
    } catch (e) {
      toast('error', errorText(e));
    }
  };

  const optionActions = (() => {
    const c = options;
    if (!c) return [];
    const list: { label: string; destructive?: boolean; onPress: () => void }[] = [];
    if (c.body) {
      const body = c.body;
      list.push({
        label: copy.copyText,
        onPress: () => {
          void Clipboard.setStringAsync(body).then(() => toast('info', copy.copied));
        },
      });
    }
    if (c.can_delete) {
      list.push({ label: copy.delete, destructive: true, onPress: () => setDeleting(c) });
    }
    if (!c.is_own && c.status === 'live') {
      list.push({ label: copy.report, destructive: true, onPress: () => setReporting(c) });
    }
    return list;
  })();

  const avatarOf = (c: FeedComment) =>
    c.author?.avatar_path ? mediaUrl(mediaBase(), c.author.avatar_path) : null;
  const t = now();
  const canComment = first?.can_comment === true;

  const renderThread = ({ item: top }: { item: FeedComment }) => {
    const replies = top.replies ?? [];
    const more = moreReplies(top, replies.filter((r) => r.status === 'live').length);
    const row = (c: FeedComment, reply: boolean) => (
      <CommentRow
        key={c.id}
        comment={c}
        ago={agoLabel(new Date(c.created_at), t)}
        avatarUri={avatarOf(c)}
        reply={reply}
        canReply={canComment && c.status === 'live'}
        onLike={() => likeComment(c)}
        onReply={() => startReply(c)}
        onOptions={() => setOptions(c)}
        testID={`comment-${c.id}`}
      />
    );
    return (
      <View style={styles.thread}>
        {row(top, false)}
        {replies.map((r) => row(r, true))}
        {more > 0 ? (
          <Tappable
            accessibilityRole="button"
            accessibilityLabel={viewRepliesText(more)}
            onPress={() => void loadReplies(top)}
            testID={`comment-${top.id}-more`}
          >
            <View style={styles.more}>
              {loadingReplies.has(top.id) ? (
                <ActivityIndicator
                  color={theme.colors.ink2}
                  accessibilityLabel={copy.loadingReplies}
                />
              ) : (
                <Text variant="label" tone="ink2">
                  {viewRepliesText(more)}
                </Text>
              )}
            </View>
          </Tappable>
        ) : null}
      </View>
    );
  };

  let body;
  if (q.isPending) {
    body = (
      <View style={styles.pad} accessibilityLabel={copy.loading}>
        <SkeletonList rows={4} testID="comments-loading" />
      </View>
    );
  } else if (q.isError && !q.data) {
    const code = toAppError(q.error).code;
    body =
      code === 'NOT_FOUND' ? (
        <View style={styles.center} testID="comments-gone">
          <EmptyState
            icon="eye"
            title={copy.goneTitle}
            body={copy.goneBody}
            action={{ label: copy.back, onPress: leave }}
          />
        </View>
      ) : (
        <ErrorState error={q.error} onRetry={() => q.refetch()} testID="comments-error" />
      );
  } else {
    const items = allComments(q.data);
    body = (
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          renderItem={renderThread}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshing={q.isRefetching && !q.isFetchingNextPage}
          onRefresh={() => void q.refetch()}
          onEndReached={() => {
            if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
          }}
          ListHeaderComponent={
            first ? (
              <View style={styles.header}>
                <Tappable
                  accessibilityRole="link"
                  accessibilityLabel={`${copy.openPost}: ${first.title}`}
                  onPress={openPost}
                  testID="comments-open-post"
                >
                  <View style={styles.postRow}>
                    <Text variant="bodyStrong" numberOfLines={2} style={styles.flex}>
                      {first.title}
                    </Text>
                    <Icon name="chev" size={18} tone="ink2" />
                  </View>
                </Tappable>
                <View style={styles.headRow}>
                  <Tappable
                    accessibilityRole="button"
                    accessibilityLabel={copy.likePost}
                    {...a11yState({ selected: first.liked })}
                    onPress={likePost}
                    testID="comments-like-post"
                  >
                    <View style={styles.likeHit}>
                      <Icon
                        name="heart"
                        size={20}
                        tone={first.liked ? 'ink' : 'ink2'}
                        strokeWidth={first.liked ? 2.4 : 1.8}
                        filled={first.liked}
                      />
                      <Text variant="label" tone={first.liked ? 'ink' : 'ink2'}>
                        {likesText(first.like_count) || copy.like}
                      </Text>
                    </View>
                  </Tappable>
                  {/* Sorting means nothing until there is something to sort (DESIGN_REVIEW 3.02). */}
                  {items.length > 0 ? (
                    <View style={styles.sorts} accessibilityLabel={copy.sortLabel}>
                      <Chip
                        label={copy.sortTop}
                        selected={sort === 'top'}
                        onPress={() => setSort('top')}
                        testID="comments-sort-top"
                      />
                      <Chip
                        label={copy.sortNew}
                        selected={sort === 'new'}
                        onPress={() => setSort('new')}
                        testID="comments-sort-new"
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty} testID="comments-empty">
              <EmptyState icon="chat" title={copy.empty} body={canComment ? copy.emptyBody : ''} />
            </View>
          }
          ListFooterComponent={
            q.isFetchingNextPage ? (
              <ActivityIndicator
                style={styles.pad}
                color={theme.colors.ink2}
                accessibilityLabel={copy.loadingMore}
              />
            ) : null
          }
          testID="comments-list"
        />
        {notice ? (
          <View style={styles.notice} testID="comments-notice">
            <Banner kind="error" message={notice} />
          </View>
        ) : null}
        {canComment ? (
          <View style={styles.composerWrap}>
            {replyTo ? (
              <View style={styles.replyBar} testID="comments-replying">
                <Text variant="meta" tone="ink2" numberOfLines={1} style={styles.flex}>
                  {fill(copy.replyingTo, { name: replyTo.name })}
                </Text>
                <Tappable
                  accessibilityRole="button"
                  accessibilityLabel={copy.cancelReply}
                  onPress={() => setReplyTo(null)}
                  testID="comments-cancel-reply"
                >
                  <View style={styles.cancelHit}>
                    <Icon name="x" size={18} tone="ink2" />
                  </View>
                </Tappable>
              </View>
            ) : null}
            <View style={styles.composer}>
              <TextInput
                ref={input}
                value={text}
                onChangeText={(v) => {
                  setText(v);
                  if (notice) setNotice(null);
                }}
                placeholder={replyTo ? copy.replyPlaceholder : copy.placeholder}
                placeholderTextColor={theme.colors.ink3}
                accessibilityLabel={copy.inputLabel}
                multiline
                maxLength={COMMENT_MAX}
                style={styles.input}
                testID="comments-input"
              />
              <IconButton
                icon="send"
                accessibilityLabel={copy.send}
                disabled={!text.trim() || sending}
                onPress={() => void send()}
                filled
                surface="accent"
                testID="comments-send"
              />
            </View>
          </View>
        ) : first ? (
          <View style={styles.readOnly} testID="comments-closed">
            <Banner kind="info" message={first.comments_enabled ? copy.closedNote : copy.offNote} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.root} testID="screen-comments">
      <NavBar
        title={copy.title}
        onLeading={leave}
        trailing={
          first?.is_owner ? (
            <IconButton
              icon="more"
              accessibilityLabel={copy.postOptions}
              onPress={() => setPostMenu(true)}
              testID="comments-post-options"
            />
          ) : undefined
        }
      />
      {body}

      <ActionSheet
        visible={!!options && optionActions.length > 0}
        onClose={() => setOptions(null)}
        title={copy.options}
        actions={optionActions}
      />
      <ActionSheet
        visible={postMenu}
        onClose={() => setPostMenu(false)}
        title={copy.postOptions}
        actions={[
          first?.comments_enabled
            ? { label: copy.turnOff, onPress: () => void setEnabled(false) }
            : { label: copy.turnOn, onPress: () => void setEnabled(true) },
          { label: copy.openPost, onPress: openPost },
        ]}
      />
      <ReportSheet
        visible={!!reporting}
        onClose={() => setReporting(null)}
        target="listing_comment"
        name={reporting?.author?.display_name ?? undefined}
        onSubmit={async ({ reason, details, block }) => {
          if (!reporting) return;
          await api.report(reporting.id, reason as CommentReportReason, details);
          track('report_submitted', { target_type: 'listing_comment' });
          if (block && reporting.author) {
            await api.block(reporting.author.id);
            refetchAll();
          }
        }}
        testID="comments-report"
      />
      <ConfirmDialog
        visible={!!deleting}
        title={copy.deleteTitle}
        message={copy.deleteBody}
        confirmLabel={copy.delete}
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          const id = deleting.id;
          try {
            await api.remove(id);
          } catch (e) {
            setDeleting(null);
            toast('error', errorText(e));
            return;
          }
          setDeleting(null);
          for (const s of ['top', 'new'] as const) {
            qc.setQueryData<Data>(commentKeys.list(listingId, s), (old) =>
              old ? removeComment(old, id) : old,
            );
          }
          const count = qc.getQueryData<Data>(key)?.pages[0]?.comment_count;
          if (count !== undefined) patchFeedPost(qc, listingId, { comment_count: count });
          toast('info', copy.deletedToast);
        }}
        testID="comments-delete"
      />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center' },
  pad: { padding: theme.space.screen },
  list: { paddingHorizontal: theme.space.screen, paddingBottom: theme.space.lg },
  header: {
    gap: theme.space.sm,
    paddingBottom: theme.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  postRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    minHeight: theme.size.hit,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  likeHit: {
    minHeight: theme.size.hit,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  sorts: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.space.xs,
  },
  thread: { paddingTop: theme.space.xs },
  more: {
    minHeight: theme.size.hit,
    justifyContent: 'center',
    paddingLeft: theme.size.hit * 2,
  },
  empty: { paddingTop: theme.space.xl },
  notice: { paddingHorizontal: theme.space.screen, paddingBottom: theme.space.sm },
  readOnly: {
    padding: theme.space.screen,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.md),
  },
  composerWrap: {
    borderTopWidth: 1,
    borderColor: theme.colors.line,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.sm),
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingLeft: theme.space.screen,
    paddingRight: theme.space.sm,
    backgroundColor: theme.colors.bg2,
  },
  cancelHit: {
    width: theme.size.hit,
    height: theme.size.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.sm,
  },
  input: {
    flex: 1,
    minHeight: theme.size.hit,
    maxHeight: theme.size.hit * 3,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.bg2,
    color: theme.colors.ink,
    fontSize: theme.type.body.fontSize,
  },
}));
