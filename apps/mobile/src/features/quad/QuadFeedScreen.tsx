import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { IconButton } from '@/components/IconButton';
import { Icon } from '@/components/icons/Icon';
import { NavBar } from '@/components/NavBar';
import { SkeletonList } from '@/components/Skeleton';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { getEnv } from '@/lib/env';
import { toAppError } from '@/lib/errors';
import { fill } from '@/lib/format';
import { quad as copy } from '@/strings';
import { feedColumn } from '@/theme/layout';

import { meApi, type Me } from '../me/api';
import { meKey } from '../me/MeScreens';

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
  /** Reads the signed-in student (campus name for the header). Tests pass a fake. */
  loadMe?: () => Promise<Me>;
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
  loadMe = () => meApi.me(),
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
  } else return <QuadFeed api={api} mediaBase={mediaBase} now={now} loadMe={loadMe} />;

  return (
    <View style={styles.root} testID="screen-quad">
      <NavBar title={copy.title} variant="large" />
      {body}
    </View>
  );
}

/**
 * Q02 Quad feed (DEC 90 mock screen 19): grey page, "Anonymous · campus" over
 * the title, Hot / New / Top as chips, the pinned note as a calm lilac card,
 * white post cards with the votes on the left, and an ink "Post" pill that
 * never covers a post's vote arrows (the list ends with room for it).
 */
function QuadFeed({ api, mediaBase, now, loadMe }: Required<Deps>) {
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
  const me = useQuery({ queryKey: meKey, queryFn: loadMe, staleTime: 5 * 60_000 });
  const campus = me.data?.campus?.short_name ?? null;
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
        ItemSeparatorComponent={Gap}
        refreshing={q.isRefetching && !q.isFetchingNextPage}
        onRefresh={() => void q.refetch()}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          pinned ? (
            <View
              style={styles.pinned}
              accessible
              accessibilityLabel={`${copy.pinned}: ${pinned.title}. ${pinned.body}`}
              testID="quad-pinned"
            >
              <Text variant="label" style={styles.regular}>
                <Text variant="label">{pinned.title}</Text>
                {` ${pinned.body}`}
              </Text>
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
            variant="card"
            testID={`quad-post-${item.id}`}
          />
        )}
        testID="quad-feed"
      />
    );
  }

  // One centered column on iPad, the phone layout's width (P17-FEAT-02).
  return (
    <View style={styles.root} testID="screen-quad">
      <View style={feedColumn}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <View style={styles.anon}>
              <Icon name="lock" size={12} tone="ink3" />
              <Text variant="meta" tone="ink3" style={styles.anonText} testID="quad-anon">
                {campus ? fill(copy.anonAt, { campus }) : copy.subtitle}
              </Text>
            </View>
            <Text variant="title" accessibilityRole="header">
              {copy.title}
            </Text>
          </View>
          <IconButton
            icon="bell"
            filled
            surface="card"
            accessibilityLabel={copy.openActivity}
            onPress={() => router.push('/quad/activity')}
            testID="quad-open-activity"
          />
          <IconButton
            icon="eye"
            filled
            surface="card"
            accessibilityLabel={copy.openMuted}
            onPress={() => router.push('/quad/muted')}
            testID="quad-open-muted"
          />
          <IconButton
            icon="user"
            filled
            surface="card"
            accessibilityLabel={copy.openMine}
            onPress={() => router.push('/quad/mine')}
            testID="quad-open-mine"
          />
        </View>
        <View style={styles.chips} accessibilityRole="tablist" accessibilityLabel={copy.sortLabel}>
          {SORTS.map((s) => (
            <Chip
              key={s}
              label={copy.sorts[s]}
              selected={sort === s}
              surface="card"
              role="tab"
              onPress={() => setSort(s)}
              testID={`quad-sort-${s}`}
            />
          ))}
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
                <Icon name="plus" size={18} tone="inverse" strokeWidth={2.2} />
                <Text variant="label" tone="inverse" overlay>
                  {copy.post}
                </Text>
              </View>
            </Tappable>
          </View>
        ) : null}
      </View>
      {actions.overlays}
    </View>
  );
}

/** Space between post cards. */
function Gap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg2 },
  center: { flex: 1, justifyContent: 'center' },
  flex: { flex: 1 },
  regular: { fontWeight: '400' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
    paddingTop: rt.insets.top + theme.space.sm,
    paddingHorizontal: theme.space.screen,
  },
  anon: { flexDirection: 'row', alignItems: 'center', gap: theme.space.xs },
  anonText: { fontWeight: '600' },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.md,
    paddingBottom: theme.space.md,
  },
  // The Post pill floats over the end of the list: its height plus its
  // margin plus a little air, so the last card's vote arrows stay reachable.
  list: {
    paddingHorizontal: theme.space.screen,
    paddingBottom: theme.size.buttonM + theme.space.lg + theme.space.xl,
  },
  gap: { height: theme.space.sm + theme.space.xs / 2 },
  pinned: {
    marginBottom: theme.space.sm + theme.space.xs / 2,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.lilacBg,
  },
  fab: { position: 'absolute', right: theme.space.screen, bottom: theme.space.lg },
  fabFill: {
    minHeight: theme.size.buttonM,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.ink,
  },
}));
