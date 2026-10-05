import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { IconButton } from '@/components/IconButton';
import { Icon } from '@/components/icons/Icon';
import { NavBar } from '@/components/NavBar';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SkeletonList } from '@/components/Skeleton';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { getEnv } from '@/lib/env';
import { toAppError } from '@/lib/errors';
import { quad as copy } from '@/strings';

import { quadApi, type QuadApi, type QuadCursor, type QuadSort } from './api';
import { quadKeys, useQuadStatus } from './cache';
import { QuadPostCard } from './components/QuadPostCard';
import { QuadWelcome } from './components/QuadWelcome';
import { useQuadActions } from './useQuadActions';

const SORTS: QuadSort[] = ['hot', 'new', 'top'];

function isSort(s: unknown): s is QuadSort {
  return typeof s === 'string' && (SORTS as string[]).includes(s);
}

type Deps = {
  api?: QuadApi;
  mediaBase?: () => string;
  now?: () => Date;
};

/** The Quad is off for this campus (or was switched off): say so, point back to Discover. */
function QuadOff() {
  const router = useRouter();
  return (
    <View style={styles.center} testID="quad-off">
      <EmptyState
        icon="quad"
        title={copy.offTitle}
        body={copy.offBody}
        action={{ label: copy.offAction, onPress: () => router.replace('/discover') }}
      />
    </View>
  );
}

/**
 * Quad tab root (P10-QUAD-02): the status gate decides between "off",
 * Welcome (Q01, first visit) and the feed (Q02).
 */
export function QuadScreen({
  api = quadApi,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  now = () => new Date(),
}: Deps) {
  const qc = useQueryClient();
  const status = useQuadStatus(api);

  let body;
  if (status.isPending) body = <SkeletonList rows={4} />;
  else if (status.isError)
    body = <ErrorState error={status.error} onRetry={() => status.refetch()} />;
  else if (!status.data.enabled) body = <QuadOff />;
  else if (!status.data.rules_accepted) {
    return (
      <QuadWelcome
        onAccept={async () => {
          await api.acceptRules();
          qc.setQueryData(quadKeys.status, { enabled: true, rules_accepted: true });
        }}
      />
    );
  } else return <QuadFeed api={api} mediaBase={mediaBase} now={now} />;

  return (
    <View style={styles.root} testID="screen-quad">
      <NavBar title={copy.title} variant="large" />
      {body}
    </View>
  );
}

/** Q02 Quad feed: Hot / New / Top, pinned announcement, votes on the right, pencil to post. */
function QuadFeed({ api, mediaBase, now }: Required<Deps>) {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ sort?: string }>();
  const [sort, setSort] = useState<QuadSort>(isSort(params.sort) ? params.sort : 'hot');
  // Posting jumps to New (/quad?sort=new) so your post is at the top.
  const [lastParam, setLastParam] = useState(params.sort);
  if (params.sort !== lastParam) {
    setLastParam(params.sort);
    if (isSort(params.sort)) setSort(params.sort);
  }

  const q = useInfiniteQuery({
    queryKey: quadKeys.feed(sort),
    queryFn: ({ pageParam }) => api.feed(sort, pageParam),
    initialPageParam: null as QuadCursor | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const actions = useQuadActions({ api });
  const off = q.isError && toAppError(q.error).code === 'FEATURE_OFF';
  useEffect(() => {
    if (off) void qc.invalidateQueries({ queryKey: quadKeys.status });
  }, [off, qc]);

  const base = mediaBase();
  const t = now();
  const newPost = () => router.push('/quad/new');

  let body;
  if (q.isPending) body = <SkeletonList rows={5} testID="quad-loading" />;
  else if (off) body = <QuadOff />;
  else if (q.isError && !q.data) body = <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  else {
    const pages = q.data?.pages ?? [];
    const items = pages.flatMap((p) => p.items);
    const pinned = pages[0]?.pinned ?? null;
    body = (
      <FlashList
        data={items}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshing={q.isRefetching && !q.isFetchingNextPage}
        onRefresh={() => void q.refetch()}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          pinned ? (
            <View style={styles.pinned} testID="quad-pinned">
              <Banner kind="info" message={`${copy.pinned}: ${pinned.title}. ${pinned.body}`} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          sort === 'top' ? (
            <EmptyState
              icon="trend"
              title={copy.topEmptyTitle}
              body={copy.topEmptyBody}
              testID="quad-empty-top"
            />
          ) : (
            <EmptyState
              icon="quad"
              tile="accent"
              title={copy.emptyTitle}
              body={copy.emptyBody}
              suggestions={[...copy.prompts]}
              action={{ label: copy.emptyAction, onPress: newPost }}
              testID="quad-empty"
            />
          )
        }
        renderItem={({ item }) => (
          <QuadPostCard
            post={item}
            now={t}
            mediaBase={base}
            onOpen={() => router.push({ pathname: '/quad/[id]', params: { id: item.id } })}
            onVote={(dir) => actions.vote({ kind: 'post', post: item }, dir)}
            onVotePoll={(optionId) => void actions.votePoll(item, optionId)}
            onOptions={() => actions.openOptions({ kind: 'post', post: item })}
            testID={`quad-post-${item.id}`}
          />
        )}
        testID="quad-feed"
      />
    );
  }

  return (
    <View style={styles.root} testID="screen-quad">
      <NavBar
        title={copy.title}
        variant="large"
        trailing={
          <>
            <IconButton
              icon="bell"
              accessibilityLabel={copy.openActivity}
              onPress={() => router.push('/quad/activity')}
              testID="quad-open-activity"
            />
            <IconButton
              icon="eye"
              accessibilityLabel={copy.openMuted}
              onPress={() => router.push('/quad/muted')}
              testID="quad-open-muted"
            />
            <IconButton
              icon="user"
              accessibilityLabel={copy.openMine}
              onPress={() => router.push('/quad/mine')}
              testID="quad-open-mine"
            />
          </>
        }
      />
      <View style={styles.head}>
        <View style={styles.anon}>
          <Icon name="lock" size={14} tone="ink2" />
          <Text variant="meta" tone="ink2">
            {copy.subtitle}
          </Text>
        </View>
        <SegmentedControl
          label={copy.sortLabel}
          segments={SORTS.map((s) => ({ value: s, label: copy.sorts[s] }))}
          value={sort}
          onChange={setSort}
        />
      </View>
      <View style={styles.flex}>{body}</View>
      {!off ? (
        <View style={styles.fab}>
          <Tappable
            accessibilityRole="button"
            accessibilityLabel={copy.newPost}
            onPress={newPost}
            testID="quad-new-post"
          >
            <View style={styles.fabFill}>
              <Icon name="edit" tone="onAccent" />
            </View>
          </Tappable>
        </View>
      ) : null}
      {actions.overlays}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, justifyContent: 'center' },
  flex: { flex: 1 },
  head: {
    gap: theme.space.sm,
    paddingHorizontal: theme.space.screen,
    paddingBottom: theme.space.sm,
  },
  anon: { flexDirection: 'row', alignItems: 'center', gap: theme.space.xs },
  list: { paddingHorizontal: theme.space.screen, paddingBottom: theme.size.buttonL * 2 },
  pinned: { paddingTop: theme.space.sm },
  fab: { position: 'absolute', right: theme.space.screen, bottom: theme.space.lg },
  fabFill: {
    width: theme.size.buttonL,
    height: theme.size.buttonL,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
  },
}));
