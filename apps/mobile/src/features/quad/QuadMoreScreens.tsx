import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Input } from '@/components/Input';
import { NavBar } from '@/components/NavBar';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Sheet } from '@/components/Sheet';
import { SkeletonList } from '@/components/Skeleton';
import { Tag } from '@/components/Tag';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { TextArea } from '@/components/TextArea';
import { useToastStore } from '@/components/Toast';
import { errorText } from '@/lib/errors';
import { fill } from '@/lib/format';
import { routeForNotification } from '@/lib/push';
import { quad as copy, safety as safetyCopy } from '@/strings/en';

import { agoLabel } from '../feed/logic';
import type { AppNotification } from '../notifications/api';
import { quadApi, type MyQuadReply, type QuadApi, type QuadPost } from './api';
import { quadKeys } from './cache';
import { pointsLabel } from './components/VoteControl';
import { canAppeal, keywordValid, statusTone } from './logic';

function useLeave() {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace('/quad'));
}

// ---------------------------------------------------------------------------
// Q12 Your Quad

type AppealReason = keyof typeof safetyCopy.appealReasons;

/** Q12 Your Quad: your posts and replies with score and status; appeal what was taken down. */
export function QuadMineScreen({
  api = quadApi,
  now = () => new Date(),
}: {
  api?: QuadApi;
  now?: () => Date;
}) {
  const router = useRouter();
  const leave = useLeave();
  const q = useQuery({ queryKey: quadKeys.mine, queryFn: () => api.mine() });
  const [tab, setTab] = useState<'posts' | 'replies'>('posts');
  const [appealing, setAppealing] = useState<QuadPost | null>(null);
  const [appealed, setAppealed] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState<AppealReason>('mistake');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = now();

  const sendAppeal = async () => {
    if (!appealing) return;
    setBusy(true);
    setError(null);
    try {
      await api.appeal(appealing.id, reason, text);
      setAppealed((s) => new Set(s).add(appealing.id));
      setAppealing(null);
      useToastStore.getState().show('success', copy.appealed);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const postRow = (p: QuadPost) => (
    <View key={p.id} style={styles.item} testID={`mine-post-${p.id}`}>
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={`${copy.status[p.status]}. ${p.body}. ${pointsLabel(p.score)}`}
        disabled={p.status !== 'live' && p.status !== 'held'}
        onPress={() => router.push({ pathname: '/quad/[id]', params: { id: p.id } })}
      >
        <View style={styles.itemBody}>
          <View style={styles.meta}>
            <Tag label={copy.status[p.status]} tone={statusTone(p.status)} />
            <Text variant="meta" tone="ink2">
              {`${agoLabel(new Date(p.created_at), t)}, ${pointsLabel(p.score)}`}
            </Text>
          </View>
          <Text variant="body" numberOfLines={4}>
            {p.body}
          </Text>
        </View>
      </Tappable>
      {canAppeal(p.status) ? (
        appealed.has(p.id) ? (
          <Text variant="meta" tone="ink2">
            {copy.appealed}
          </Text>
        ) : (
          <Button
            label={copy.appeal}
            variant="secondary"
            size="S"
            onPress={() => {
              setReason('mistake');
              setText('');
              setError(null);
              setAppealing(p);
            }}
            testID={`mine-appeal-${p.id}`}
          />
        )
      ) : null}
    </View>
  );

  const replyRow = (r: MyQuadReply) => (
    <Tappable
      key={r.id}
      accessibilityRole="button"
      accessibilityLabel={`${copy.status[r.status]}. ${r.body}. ${pointsLabel(r.score)}`}
      onPress={() => router.push({ pathname: '/quad/[id]', params: { id: r.post_id } })}
      testID={`mine-reply-${r.id}`}
    >
      <View style={[styles.item, styles.itemBody]}>
        <View style={styles.meta}>
          <Tag label={copy.status[r.status]} tone={statusTone(r.status)} />
          <Text variant="meta" tone="ink2">
            {`${agoLabel(new Date(r.created_at), t)}, ${pointsLabel(r.score)}`}
          </Text>
        </View>
        <Text variant="body">{r.body}</Text>
        <Text variant="meta" tone="ink2" numberOfLines={1}>
          {fill(copy.onPost, { excerpt: r.post_excerpt })}
        </Text>
      </View>
    </Tappable>
  );

  let body;
  if (q.isPending) body = <SkeletonList rows={4} />;
  else if (q.isError) body = <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  else {
    const list = tab === 'posts' ? q.data.posts : q.data.replies;
    body = (
      <ScrollView contentContainerStyle={styles.list}>
        {list.length === 0 ? (
          <EmptyState
            icon="quad"
            title={tab === 'posts' ? copy.mineEmptyPosts : copy.mineEmptyReplies}
            testID="mine-empty"
          />
        ) : tab === 'posts' ? (
          q.data.posts.map(postRow)
        ) : (
          q.data.replies.map(replyRow)
        )}
      </ScrollView>
    );
  }

  return (
    <View style={styles.root} testID="screen-quad-mine">
      <NavBar title={copy.mineTitle} onLeading={leave} />
      <View style={styles.head}>
        <Text variant="meta" tone="ink2">
          {copy.onlyYou}
        </Text>
        <SegmentedControl
          label={copy.mineTitle}
          segments={[
            { value: 'posts', label: copy.minePosts },
            { value: 'replies', label: copy.mineReplies },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {body}
      <Sheet
        visible={!!appealing}
        onClose={() => setAppealing(null)}
        title={safetyCopy.appealTitle}
        testID="quad-appeal-sheet"
      >
        <View style={styles.sheet}>
          <View style={styles.chips}>
            {(Object.keys(safetyCopy.appealReasons) as AppealReason[]).map((k) => (
              <Chip
                key={k}
                label={safetyCopy.appealReasons[k]}
                selected={reason === k}
                onPress={() => setReason(k)}
              />
            ))}
          </View>
          <TextArea
            label={safetyCopy.appealBody}
            placeholder={safetyCopy.appealPlaceholder}
            value={text}
            onChangeText={setText}
            maxLength={500}
          />
          {error ? <Banner kind="error" message={error} /> : null}
          <Button
            label={safetyCopy.appealSend}
            loading={busy}
            onPress={() => void sendAppeal()}
            testID="quad-appeal-send"
          />
        </View>
      </Sheet>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Q13 Quad activity

/** Q13 Quad activity: replies and milestones on your posts (notifications in the quad group). */
export function QuadActivityScreen({
  api = quadApi,
  now = () => new Date(),
}: {
  api?: QuadApi;
  now?: () => Date;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const leave = useLeave();
  const q = useInfiniteQuery({
    queryKey: quadKeys.activity,
    queryFn: ({ pageParam }) => api.notifications(pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) =>
      last.items.length < 30 ? undefined : last.items[last.items.length - 1]!.id,
  });
  const t = now();

  const open = (n: AppNotification) => {
    if (!n.read) {
      void api
        .markRead([n.id])
        .then(() =>
          Promise.all([
            qc.invalidateQueries({ queryKey: quadKeys.activity }),
            qc.invalidateQueries({ queryKey: ['notifications'] }),
          ]),
        )
        .catch(() => {});
    }
    const href = routeForNotification({ ...n.data, type: n.type });
    if (href) router.push(href);
  };

  let body;
  if (q.isPending) body = <SkeletonList rows={5} />;
  else if (q.isError) body = <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  else {
    const items = q.data.pages.flatMap((p) => p.items).filter((n) => n.grp === 'quad');
    body = (
      <FlatList
        data={items}
        keyExtractor={(n) => String(n.id)}
        contentContainerStyle={styles.list}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
        }}
        ListEmptyComponent={
          <EmptyState
            icon="bell"
            title={copy.activityEmptyTitle}
            body={copy.activityEmptyBody}
            testID="quad-activity-empty"
          />
        }
        renderItem={({ item: n }) => (
          <Tappable
            accessibilityRole="button"
            accessibilityLabel={`${n.title}. ${n.body}`}
            onPress={() => open(n)}
            testID={`quad-activity-${n.id}`}
          >
            <View style={styles.activity}>
              <View style={styles.dot(!n.read)} />
              <View style={styles.flex}>
                <Text variant={n.read ? 'body' : 'bodyStrong'}>{n.title}</Text>
                <Text variant="meta" tone="ink2">
                  {`${n.body} ${agoLabel(new Date(n.created_at), t)}`}
                </Text>
              </View>
            </View>
          </Tappable>
        )}
        testID="quad-activity-list"
      />
    );
  }

  return (
    <View style={styles.root} testID="screen-quad-activity">
      <NavBar title={copy.activityTitle} onLeading={leave} />
      {body}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Q14 Muted

/** Q14 Muted: people you hid (by the post you hid them from) and muted words. */
export function QuadMutedScreen({ api = quadApi }: { api?: QuadApi }) {
  const qc = useQueryClient();
  const leave = useLeave();
  const hides = useQuery({ queryKey: quadKeys.hides, queryFn: () => api.hides() });
  const mutes = useQuery({ queryKey: quadKeys.mutes, queryFn: () => api.mutes() });
  const [word, setWord] = useState('');
  const [wordError, setWordError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const refreshFeeds = () => qc.invalidateQueries({ queryKey: quadKeys.feeds });
  const fail = (e: unknown) => useToastStore.getState().show('error', errorText(e));

  const unhide = async (sourcePostId: string) => {
    try {
      await api.unhide(sourcePostId);
      await qc.invalidateQueries({ queryKey: quadKeys.hides });
      void refreshFeeds();
    } catch (e) {
      fail(e);
    }
  };

  const add = async () => {
    if (!keywordValid(word)) {
      setWordError(copy.keywordInvalid);
      return;
    }
    setAdding(true);
    setWordError(null);
    try {
      await api.mute(word.trim());
      setWord('');
      await qc.invalidateQueries({ queryKey: quadKeys.mutes });
      void refreshFeeds();
    } catch (e) {
      setWordError(errorText(e));
    } finally {
      setAdding(false);
    }
  };

  const unmute = async (kw: string) => {
    try {
      await api.unmute(kw);
      await qc.invalidateQueries({ queryKey: quadKeys.mutes });
      void refreshFeeds();
    } catch (e) {
      fail(e);
    }
  };

  let hidden;
  if (hides.isPending) hidden = <SkeletonList rows={2} />;
  else if (hides.isError)
    hidden = <ErrorState error={hides.error} onRetry={() => hides.refetch()} layout="inline" />;
  else if (hides.data.length === 0)
    hidden = (
      <Text variant="body" tone="ink2">
        {copy.noHidden}
      </Text>
    );
  else
    hidden = hides.data.map((h) => (
      <View key={h.source_post_id} style={styles.hideRow} testID={`hide-${h.source_post_id}`}>
        <Text variant="body" style={styles.flex}>
          {fill(copy.hiddenFrom, { excerpt: h.excerpt })}
        </Text>
        <Button
          label={copy.unhide}
          variant="secondary"
          size="S"
          accessibilityHint={fill(copy.unhideLabel, { excerpt: h.excerpt })}
          onPress={() => void unhide(h.source_post_id)}
          testID={`unhide-${h.source_post_id}`}
        />
      </View>
    ));

  let words;
  if (mutes.isPending) words = <SkeletonList rows={1} />;
  else if (mutes.isError)
    words = <ErrorState error={mutes.error} onRetry={() => mutes.refetch()} layout="inline" />;
  else if (mutes.data.length === 0)
    words = (
      <Text variant="body" tone="ink2">
        {copy.noKeywords}
      </Text>
    );
  else
    words = (
      <View style={styles.chips}>
        {mutes.data.map((kw) => (
          <Chip
            key={kw}
            label={kw}
            onRemove={() => void unmute(kw)}
            removeLabel={copy.removeKeyword}
          />
        ))}
      </View>
    );

  return (
    <View style={styles.root} testID="screen-quad-muted">
      <NavBar title={copy.mutedTitle} onLeading={leave} />
      <ScrollView contentContainerStyle={styles.sections} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text variant="heading" accessibilityRole="header">
            {copy.hiddenPeople}
          </Text>
          {hidden}
        </View>
        <View style={styles.section}>
          <Text variant="heading" accessibilityRole="header">
            {copy.keywords}
          </Text>
          <Text variant="meta" tone="ink2">
            {copy.keywordsBody}
          </Text>
          <Input
            label={copy.keywordLabel}
            placeholder={copy.keywordPlaceholder}
            value={word}
            onChangeText={(v) => {
              setWord(v);
              setWordError(null);
            }}
            maxLength={30}
            autoCapitalize="none"
            error={wordError ?? undefined}
            onSubmitEditing={() => void add()}
            testID="mute-input"
          />
          <Button
            label={copy.addKeyword}
            variant="secondary"
            size="M"
            loading={adding}
            onPress={() => void add()}
            testID="mute-add"
          />
          {words}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  flex: { flex: 1 },
  head: {
    gap: theme.space.sm,
    paddingHorizontal: theme.space.screen,
    paddingBottom: theme.space.sm,
  },
  list: { paddingHorizontal: theme.space.screen, paddingBottom: theme.space['2xl'] },
  item: {
    gap: theme.space.sm,
    paddingVertical: theme.space.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
    alignItems: 'flex-start',
  },
  itemBody: { gap: theme.space.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  sheet: { gap: theme.space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  activity: {
    flexDirection: 'row',
    gap: theme.space.md,
    paddingVertical: theme.space.md,
    minHeight: theme.space.rowMin,
  },
  dot: (on: boolean) => ({
    width: theme.space.sm,
    height: theme.space.sm,
    marginTop: theme.space.sm,
    borderRadius: theme.radius.chip,
    backgroundColor: on ? theme.colors.accent : 'transparent',
  }),
  sections: { gap: theme.space.xl, padding: theme.space.screen },
  section: { gap: theme.space.sm },
  hideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingVertical: theme.space.sm,
  },
}));
