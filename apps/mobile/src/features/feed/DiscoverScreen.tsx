import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';
import type { StoreApi } from 'zustand';

import { track as trackActivity } from '@/lib/activity';
import { track } from '@/lib/analytics';
import { motion } from '@onlyswap/tokens';
import { useOfflineNote } from '@/components/Banner';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Photo } from '@/components/Photo';
import { Text } from '@/components/Text';
import { useToastStore } from '@/components/Toast';
import { useScreenReader } from '@/lib/a11y';
import { getEnv } from '@/lib/env';
import { isWebPlatform } from '@/lib/platform';
import { fill } from '@/lib/format';
import { getStorage } from '@/lib/storage';
import { feed as copy } from '@/strings';
import { LAYOUT, useLayout } from '@/theme/layout';
import { useReducedMotion } from '@/theme/reducedMotion';

import { DiscoverHeader } from '../campus/DiscoverHeader';
import { meApi, type Me } from '../me/api';
import { meKey } from '../me/MeScreens';
import { feedApi, type FeedApi } from './api';
import { DEEP_SCALE, NEXT_SCALE, PEEK, type SwipeDir } from './deckMath';
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
 * B01 Discover (P6-FEED-03; DESIGN_REVIEW 3.02): the deck, a one-line
 * first-swipe hint above the actions, prefetch, end of deck, day-one hero,
 * undo toast and the offline-safe swipe queue, with a queued-swipes line
 * while the global offline banner shows.
 */
export function DiscoverScreen({
  api = feedApi,
  swipes,
  coach = defaultCoach,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  now = () => new Date(),
  loadMe = () => meApi.me(),
}: {
  api?: FeedApi;
  swipes?: StoreApi<SwipeState>;
  coach?: CoachStorage;
  mediaBase?: () => string;
  now?: () => Date;
  /** The signed-in student, for the campus name on the end and day-one states. */
  loadMe?: () => Promise<Me>;
}) {
  const router = useRouter();
  // iPad, wide window: a grid instead of swiping, beside the sidebar (board N5).
  // Narrower windows keep the deck, with the card capped (LAYOUT.deckMax).
  // The web app always browses as a grid (W08): a mouse doesn't swipe.
  const layout = useLayout();
  const gridWidth = layout.wide
    ? layout.width - LAYOUT.railWidth
    : isWebPlatform()
      ? layout.width
      : undefined;
  // Same rule as SwipeDeck's list mode (X33): nothing to swipe, so no swipe hint.
  const screenReader = useScreenReader();
  const reduced = useReducedMotion();
  const swiping = gridWidth === undefined && !screenReader && !reduced;
  // The one offline pill (Banner.tsx) says what offline means here.
  useOfflineNote(copy.offlinePill);
  const me = useQuery({ queryKey: meKey, queryFn: loadMe, staleTime: 5 * 60_000 });
  const campus = me.data?.campus?.short_name ?? null;
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
  // What you saved on this run through the pile, for the end-of-pile thumbnails.
  const [savedHere, setSavedHere] = useState<DeckCard[]>([]);
  const lastDir = useRef<SwipeDir | null>(null);
  // Time on the top card (DEC 93): counted only while Discover is in front.
  const topCard = useRef<{ id: string; ms: number; since: number | null } | null>(null);

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
        setError(null);
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

  // Time on card for the top card of the deck (not the grid); it goes with the swipe (E-03, DEC 100).
  const topId = gridWidth === undefined && phase === 'ready' ? cards[0]?.id : undefined;
  useEffect(() => {
    if (!topId || topCard.current?.id === topId) return;
    topCard.current = { id: topId, ms: 0, since: Date.now() };
  }, [topId]);
  useFocusEffect(
    useCallback(() => {
      const t = topCard.current;
      if (t && t.since === null) t.since = Date.now();
      return () => {
        const c = topCard.current;
        if (c && c.since !== null) {
          c.ms += Date.now() - c.since;
          c.since = null;
        }
      };
    }, []),
  );
  const dwellOn = useCallback((id: string) => {
    const t = topCard.current;
    if (!t || t.id !== id) return undefined;
    return t.ms + (t.since !== null ? Date.now() - t.since : 0);
  }, []);

  const undo = useCallback(async () => {
    const id = await store.getState().undo();
    if (!id) return;
    const item = removed.current.get(id);
    swiped.current.delete(id);
    if (item) {
      setItems((prev) => [item, ...prev.filter((p) => p.id !== id)]);
      if (lastDir.current === 'save' && !item.saved) {
        void api.unsave(id).catch(() => {});
        trackActivity('unsaved', { listingId: id, source: 'discover' });
      }
    }
  }, [store, api]);

  const dismissCoach = useCallback(() => {
    setShowCoach(false);
    coach.markSeen();
  }, [coach]);

  const setSaved = useCallback((id: string, saved: boolean) => {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, saved } : p)));
  }, []);

  // The bookmark (DEC 144): saving keeps the card where it is, with Undo.
  const onToggleSave = useCallback(
    (card: DeckCard) => {
      const toast = useToastStore.getState();
      if (showCoach) dismissCoach();
      if (card.saved) {
        setSaved(card.id, false);
        setSavedHere((prev) => prev.filter((c) => c.id !== card.id));
        api.unsave(card.id).catch(() => {
          setSaved(card.id, true);
          toast.show('error', copy.saveFailed);
        });
        trackActivity('unsaved', { listingId: card.id, source: 'discover' });
        return;
      }
      setSaved(card.id, true);
      setSavedHere((prev) => [...prev.filter((c) => c.id !== card.id), card]);
      api.save(card.id).catch(() => {
        setSaved(card.id, false);
        toast.show('error', copy.saveFailed);
      });
      toast.showUndo(copy.undoSaved, () => {
        setSaved(card.id, false);
        setSavedHere((prev) => prev.filter((c) => c.id !== card.id));
        void api.unsave(card.id).catch(() => {});
      });
    },
    [api, setSaved, showCoach, dismissCoach],
  );

  const onSwipe = useCallback(
    (card: DeckCard, dir: SwipeDir) => {
      if (dir === 'save') {
        onToggleSave(card);
        return;
      }
      const item = items.find((i) => i.id === card.id);
      if (item) removed.current.set(card.id, item);
      swiped.current.add(card.id);
      lastDir.current = dir;
      setItems((prev) => prev.filter((p) => p.id !== card.id));
      store.getState().swipe(card.id, dir, dwellOn(card.id));
      track('card_swiped', { dir });
      if (showCoach) dismissCoach();
      const toast = useToastStore.getState();
      if (dir === 'left') {
        toast.showUndo(copy.undoSkipped, () => void undo());
      } else {
        router.push({ pathname: '/listing/[id]/offer', params: { id: card.id } });
      }
    },
    [items, store, showCoach, dismissCoach, router, undo, dwellOn, onToggleSave],
  );

  const onOpen = useCallback(
    (card: DeckCard) => {
      // The hint ends on the first swipe or tap.
      if (showCoach) dismissCoach();
      router.push({ pathname: '/listing/[id]', params: { id: card.id, from: 'discover' } });
    },
    [router, showCoach, dismissCoach],
  );

  const header = <DiscoverHeader />;

  let body;
  if (phase === 'loading') {
    body = (
      <View style={styles.deck}>
        <PilePlaceholder />
      </View>
    );
  } else if (phase === 'error' || (cards.length === 0 && !ended && error !== null)) {
    // A failed next page that leaves the deck empty reads like a first-page failure.
    const retry = phase === 'error' ? refresh : () => load(false);
    body = <ErrorState error={error} onRetry={retry} testID="discover-error" />;
  } else if (cards.length === 0 && ended) {
    const dayOne = total < DAY_ONE_MAX;
    const sell = { label: copy.endSell, onPress: () => router.push('/sell') };
    body = dayOne ? (
      <EmptyState
        lead={
          total > 0 ? (
            <Text variant="label" tone="ink2" style={styles.eyebrow}>
              {total === 1 ? copy.dayOneCountOne : fill(copy.dayOneCount, { n: total })}
            </Text>
          ) : undefined
        }
        title={campus ? fill(copy.dayOneTitleCampus, { campus }) : copy.dayOneTitle}
        body={copy.dayOneBody}
        action={sell}
        testID="discover-day-one"
      />
    ) : (
      <EmptyState
        lead={savedHere.length > 0 ? <SavedThumbs cards={savedHere} /> : undefined}
        title={campus ? fill(copy.endTitleCampus, { campus }) : copy.endTitle}
        body={[
          savedHere.length === 1
            ? copy.endSavedOne
            : savedHere.length > 1
              ? fill(copy.endSaved, { n: savedHere.length })
              : null,
          copy.endBody,
        ]
          .filter(Boolean)
          .join(' ')}
        action={
          savedHere.length > 0
            ? { label: copy.seeSaved, onPress: () => router.push('/saved') }
            : sell
        }
        secondaryAction={savedHere.length > 0 ? sell : undefined}
        testID="discover-end"
      />
    );
  } else {
    // First time only: one quiet line, and the top card wiggles once.
    const coachOn = showCoach && swiping && cards.length > 0;
    const hint = coachOn ? (
      <Animated.View
        key="coach"
        entering={FadeIn.duration(motion.fade.duration)}
        testID="discover-coach"
      >
        <Text variant="meta" tone="ink2">
          {copy.coachBody}
        </Text>
      </Animated.View>
    ) : null;
    body = (
      <View style={gridWidth !== undefined ? styles.flex : styles.deck}>
        <SwipeDeck
          cards={cards}
          onSwipe={onSwipe}
          onOpen={onOpen}
          onToggleSave={onToggleSave}
          wiggle={coachOn}
          gridWidth={gridWidth}
          hint={hint}
        />
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

/**
 * While the first page loads (round 2 frame 8): the pile's shape in quiet
 * fills, no shimmer. Once cards arrive, each photo shows its own blur
 * colors (blurhash) until it sharpens.
 */
function PilePlaceholder() {
  return (
    <View
      style={styles.pile}
      accessibilityLabel={copy.loading}
      accessibilityState={{ busy: true }}
      testID="discover-loading"
    >
      <View style={[styles.pileCard, styles.pileDeep]} />
      <View style={[styles.pileCard, styles.pileNext]} />
      <View style={styles.pileCard} />
    </View>
  );
}

/** Up to three photos of what you saved on the way down the pile. */
function SavedThumbs({ cards }: { cards: DeckCard[] }) {
  return (
    <View style={styles.thumbs} accessible={false} importantForAccessibility="no-hide-descendants">
      {cards.slice(-3).map((c, i) => (
        <View key={c.id} style={styles.thumb(i)}>
          <Photo source={c.photos[0]?.uri ?? null} blurhash={c.photos[0]?.blurhash ?? null} fill />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  flex: { flex: 1 },
  deck: { flex: 1, width: '100%', maxWidth: LAYOUT.deckMax, alignSelf: 'center' },
  stage: { flex: 1, margin: theme.space.screen },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 0.4 },
  pile: {
    flex: 1,
    marginHorizontal: theme.space.md,
    marginTop: theme.space.xs,
    marginBottom: PEEK + theme.space.md,
  },
  pileCard: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.deck,
    backgroundColor: theme.colors.bg2,
  },
  pileNext: {
    transform: [{ translateY: PEEK }, { scale: NEXT_SCALE }],
    backgroundColor: theme.colors.bg3,
  },
  pileDeep: {
    transform: [{ translateY: PEEK * 2 }, { scale: DEEP_SCALE }],
    backgroundColor: theme.colors.line,
  },
  thumbs: { flexDirection: 'row' },
  thumb: (i: number) => ({
    width: theme.size.hit + theme.space.md,
    height: theme.size.hit + theme.space.md,
    borderRadius: theme.radius.thumb,
    overflow: 'hidden',
    marginLeft: i === 0 ? 0 : -theme.space.md,
    borderWidth: 2,
    borderColor: theme.colors.bg,
    transform: [{ rotate: `${(i - 1) * 6}deg` }],
  }),
}));
