import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { StoreApi } from 'zustand';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { IconButton } from '@/components/IconButton';
import { NavBar } from '@/components/NavBar';
import { SkeletonCard } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { useToastStore } from '@/components/Toast';
import { getEnv } from '@/lib/env';
import { getStorage } from '@/lib/storage';
import { feed as copy } from '@/strings/en';

import { feedApi, type FeedApi } from './api';
import type { SwipeDir } from './deckMath';
import {
  DAY_ONE_MAX,
  mergePage,
  nextCursor,
  toDeckCard,
  type FeedCursor,
  type FeedItem,
} from './logic';
import type { DeckCard } from './SwipeCard';
import { SwipeDeck } from './SwipeDeck';
import { getSwipeStore, useSwipeFlush, type SwipeState } from './swipes';

export const PAGE = 20;
/** Fetch the next page when this few cards are left. */
const PREFETCH_AT = 5;

type CoachStorage = { seen: () => boolean; markSeen: () => void };
const defaultCoach: CoachStorage = {
  seen: () => getStorage().get('onboarding.swipeCoachSeen') === true,
  markSeen: () => getStorage().set('onboarding.swipeCoachSeen', true),
};

type Phase = 'loading' | 'ready' | 'error';

/**
 * B01 Discover (P6-FEED-03): the deck, first-swipe coach, prefetch, end of
 * deck, day-one hero, undo toast and the offline-safe swipe queue.
 */
export function DiscoverScreen({
  api = feedApi,
  swipes,
  coach = defaultCoach,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  now = () => new Date(),
}: {
  api?: FeedApi;
  swipes?: StoreApi<SwipeState>;
  coach?: CoachStorage;
  mediaBase?: () => string;
  now?: () => Date;
}) {
  const router = useRouter();
  const store = useMemo(() => swipes ?? getSwipeStore(api), [swipes, api]);
  useSwipeFlush(store);

  const [items, setItems] = useState<FeedItem[]>([]);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<unknown>(null);
  const [ended, setEnded] = useState(false);
  const [total, setTotal] = useState(0);
  const [showCoach, setShowCoach] = useState(() => !coach.seen());
  const cursor = useRef<FeedCursor | null>(null);
  const loading = useRef(false);
  const removed = useRef(new Map<string, FeedItem>());
  const swiped = useRef(new Set<string>());
  const lastDir = useRef<SwipeDir | null>(null);

  const load = useCallback(
    async (fresh: boolean) => {
      if (loading.current) return;
      loading.current = true;
      if (fresh) cursor.current = null;
      try {
        const page = await api.getFeed(cursor.current, PAGE);
        // Swipes still in the queue aren't on the server yet; keep them out.
        const pending = new Set([
          ...swiped.current,
          ...store.getState().queue.map((q) => q.listing_id),
        ]);
        setItems((prev) => mergePage(fresh ? [] : prev, page, pending));
        setTotal((t) => (fresh ? page.length : t + page.length));
        cursor.current = nextCursor(page, PAGE);
        setEnded(!cursor.current);
        setPhase('ready');
      } catch (e) {
        setError(e);
        if (fresh) setPhase('error');
      } finally {
        loading.current = false;
      }
    },
    [api, store],
  );

  const refresh = useCallback(() => {
    setPhase('loading');
    setEnded(false);
    return load(true);
  }, [load]);

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    if (phase === 'ready' && !ended && items.length <= PREFETCH_AT) void load(false);
  }, [phase, ended, items.length, load]);

  const cards = useMemo(() => {
    const base = mediaBase();
    const t = now();
    return items.map((i) => toDeckCard(i, base, t));
  }, [items, mediaBase, now]);

  const undo = useCallback(async () => {
    const id = await store.getState().undo();
    if (!id) return;
    const item = removed.current.get(id);
    swiped.current.delete(id);
    if (item) {
      setItems((prev) => [item, ...prev.filter((p) => p.id !== id)]);
      if (lastDir.current === 'save' && !item.saved) void api.unsave(id).catch(() => {});
    }
  }, [store, api]);

  const onSwipe = useCallback(
    (card: DeckCard, dir: SwipeDir) => {
      const item = items.find((i) => i.id === card.id);
      if (item) removed.current.set(card.id, item);
      swiped.current.add(card.id);
      lastDir.current = dir;
      setItems((prev) => prev.filter((p) => p.id !== card.id));
      store.getState().swipe(card.id, dir);
      if (showCoach) {
        setShowCoach(false);
        coach.markSeen();
      }
      const toast = useToastStore.getState();
      if (dir === 'save') {
        api.save(card.id).catch(() => toast.show('error', copy.saveFailed));
        toast.showUndo(copy.undoSaved, () => void undo());
      } else if (dir === 'left') {
        toast.showUndo(copy.undoSkipped, () => void undo());
      } else {
        router.push({ pathname: '/listing/[id]', params: { id: card.id, offer: '1' } });
      }
    },
    [items, store, showCoach, coach, api, router, undo],
  );

  const onOpen = useCallback(
    (card: DeckCard) => router.push({ pathname: '/listing/[id]', params: { id: card.id } }),
    [router],
  );

  const header = (
    <NavBar
      variant="large"
      title={copy.title}
      trailing={
        <IconButton
          icon="search"
          accessibilityLabel={copy.search}
          onPress={() => router.push('/search')}
          testID="discover-search"
        />
      }
    />
  );

  let body;
  if (phase === 'loading') {
    body = (
      <View style={styles.stage} accessibilityLabel={copy.loading} testID="discover-loading">
        <SkeletonCard />
      </View>
    );
  } else if (phase === 'error') {
    body = <ErrorState error={error} onRetry={refresh} testID="discover-error" />;
  } else if (cards.length === 0 && ended) {
    const dayOne = total < DAY_ONE_MAX;
    body = (
      <EmptyState
        icon={dayOne ? 'plussq' : 'cards'}
        tile={dayOne ? 'accent' : 'neutral'}
        title={dayOne ? copy.dayOneTitle : copy.endTitle}
        body={dayOne ? copy.dayOneBody : copy.endBody}
        action={{ label: copy.endSell, onPress: () => router.push('/sell') }}
        secondaryAction={{ label: copy.endRefresh, onPress: () => void refresh() }}
        testID={dayOne ? 'discover-day-one' : 'discover-end'}
      />
    );
  } else {
    body = (
      <View style={styles.flex}>
        <SwipeDeck cards={cards} onSwipe={onSwipe} onOpen={onOpen} />
        {showCoach && cards.length > 0 ? (
          <View style={styles.coach} testID="discover-coach" accessibilityViewIsModal={false}>
            <Text variant="heading" accessibilityRole="header">
              {copy.coachTitle}
            </Text>
            <Text variant="body" tone="ink2">
              {copy.coachBody}
            </Text>
            <Button
              label={copy.coachOk}
              size="M"
              variant="dark"
              onPress={() => {
                setShowCoach(false);
                coach.markSeen();
              }}
            />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.root} testID="screen-discover">
      {header}
      {body}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  flex: { flex: 1 },
  stage: { flex: 1, margin: theme.space.screen },
  coach: {
    position: 'absolute',
    left: theme.space.screen,
    right: theme.space.screen,
    bottom: theme.space['2xl'] * 3,
    padding: theme.space.lg,
    gap: theme.space.sm,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
}));
