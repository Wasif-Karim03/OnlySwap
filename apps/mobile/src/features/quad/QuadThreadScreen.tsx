import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { IconButton } from '@/components/IconButton';
import { NavBar } from '@/components/NavBar';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { useToastStore } from '@/components/Toast';
import { getEnv } from '@/lib/env';
import { errorText, toAppError } from '@/lib/errors';
import { quad as copy } from '@/strings/en';

import { quadApi, type QuadApi, type QuadReply } from './api';
import { patchPost, quadKeys, type ThreadData } from './cache';
import { blockedText, heldText } from './components/OutcomeSheet';
import { QuadPostCard } from './components/QuadPostCard';
import { ReplyRow } from './components/ReplyRow';
import { REPLY_MAX } from './logic';
import { useQuadActions } from './useQuadActions';

/**
 * Q05 Post thread: the full post, replies under per-thread aliases (OP, Anon
 * A, Anon B ...), a reply composer that rides the keyboard, Post options.
 */
export function QuadThreadScreen({
  id,
  api = quadApi,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  now = () => new Date(),
}: {
  id: string;
  api?: QuadApi;
  mediaBase?: () => string;
  now?: () => Date;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { theme } = useUnistyles();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/quad'));
  const q = useQuery({ queryKey: quadKeys.thread(id), queryFn: () => api.thread(id) });
  const actions = useQuadActions({ api, onGone: leave });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'info' | 'error'; message: string } | null>(null);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const res = await api.createReply(id, body);
      if (res.status === 'blocked') {
        setNotice({ kind: 'error', message: blockedText(res.reason) });
        return;
      }
      setText('');
      if (res.status === 'held') setNotice({ kind: 'info', message: heldText(res.reason) });
      else patchPost(qc, id, (p) => ({ ...p, reply_count: p.reply_count + 1 }));
      await qc.invalidateQueries({ queryKey: quadKeys.thread(id) });
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'RULES_REQUIRED') {
        void qc.invalidateQueries({ queryKey: quadKeys.status });
        router.replace('/quad');
        return;
      }
      if (err.code === 'FORBIDDEN' && err.detail === 'replies_off') {
        patchPost(qc, id, (p) => ({ ...p, replies_enabled: false }));
      }
      useToastStore.getState().show('error', errorText(e));
    } finally {
      setSending(false);
    }
  };

  let body;
  if (q.isPending) body = <SkeletonList rows={4} />;
  else if (q.isError) {
    const code = toAppError(q.error).code;
    body =
      code === 'NOT_FOUND' || code === 'FEATURE_OFF' ? (
        <View style={styles.center} testID="quad-thread-gone">
          <EmptyState
            icon="eye"
            title={copy.unavailableTitle}
            body={copy.unavailableBody}
            action={{ label: copy.backToQuad, onPress: leave }}
          />
        </View>
      ) : (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      );
  } else {
    const { post, replies }: ThreadData = q.data;
    const t = now();
    const canReply = post.status === 'live' && post.replies_enabled;
    body = (
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <FlatList
          data={replies}
          keyExtractor={(r: QuadReply) => r.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshing={q.isRefetching}
          onRefresh={() => void q.refetch()}
          ListHeaderComponent={
            <QuadPostCard
              post={post}
              now={t}
              mediaBase={mediaBase()}
              full
              onVote={(dir) => actions.vote({ kind: 'post', post }, dir)}
              onVotePoll={(optionId) => void actions.votePoll(post, optionId)}
              onOptions={() => actions.openOptions({ kind: 'post', post })}
              testID="quad-thread-post"
            />
          }
          ListEmptyComponent={
            <Text variant="body" tone="ink2" style={styles.noReplies}>
              {copy.noReplies}
            </Text>
          }
          renderItem={({ item }) => (
            <ReplyRow
              reply={item}
              now={t}
              onVote={(dir) => actions.vote({ kind: 'reply', postId: post.id, reply: item }, dir)}
              onOptions={() => actions.openOptions({ kind: 'reply', postId: post.id, reply: item })}
              testID={`quad-reply-${item.id}`}
            />
          )}
          testID="quad-thread"
        />
        {notice ? (
          <View style={styles.notice} testID="quad-reply-notice">
            <Banner kind={notice.kind} message={notice.message} />
          </View>
        ) : null}
        {canReply ? (
          <View style={styles.composer}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={copy.replyPlaceholder}
              placeholderTextColor={theme.colors.ink3}
              accessibilityLabel={copy.replyLabel}
              multiline
              maxLength={REPLY_MAX}
              style={styles.input}
              testID="quad-reply-input"
            />
            <IconButton
              icon="send"
              accessibilityLabel={copy.sendReply}
              disabled={!text.trim() || sending}
              onPress={() => void send()}
              filled
              testID="quad-reply-send"
            />
          </View>
        ) : post.status === 'live' ? (
          <View style={styles.readOnly} testID="quad-replies-off">
            <Banner kind="info" message={copy.repliesOffNote} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.root} testID="screen-quad-thread">
      <NavBar title={copy.threadTitle} onLeading={leave} />
      {body}
      {actions.overlays}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center' },
  list: { paddingHorizontal: theme.space.screen, paddingBottom: theme.space.lg },
  noReplies: { paddingVertical: theme.space.lg },
  notice: { paddingHorizontal: theme.space.screen, paddingBottom: theme.space.sm },
  readOnly: {
    padding: theme.space.screen,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.md),
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.sm,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.sm),
    borderTopWidth: 1,
    borderColor: theme.colors.line,
  },
  input: {
    flex: 1,
    minHeight: theme.size.hit,
    maxHeight: theme.size.hit * 3,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.bg2,
    color: theme.colors.ink,
    fontSize: theme.type.body.fontSize,
  },
}));
