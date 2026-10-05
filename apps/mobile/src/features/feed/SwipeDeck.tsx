import {
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from 'react';
import {
  ScrollView,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { motion } from '@onlyswap/tokens';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { useScreenReader } from '@/lib/a11y';
import { haptic } from '@/lib/haptics';
import { feed as copy } from '@/strings';
import { useReducedMotion } from '@/theme/reducedMotion';

import {
  FLY_MS,
  NEXT_SCALE,
  flyTarget,
  nextScale,
  pastThreshold,
  releaseDir,
  rotationFor,
  stampOpacity,
  type SwipeDir,
} from './deckMath';
import { cardLabel, SwipeCard, type DeckCard } from './SwipeCard';

export type SwipeDeckHandle = {
  /** Button presses and tests: fly the top card out as if swiped. */
  swipe: (dir: SwipeDir) => void;
};

type Props = {
  /** Cards still to see, top first. The screen removes a card after `onSwipe`. */
  cards: DeckCard[];
  onSwipe: (card: DeckCard, dir: SwipeDir) => void;
  onOpen: (card: DeckCard) => void;
  /** Forces list mode; by default it follows the screen reader and reduce motion (X33). */
  listMode?: boolean;
  ref?: Ref<SwipeDeckHandle>;
  testID?: string;
};

/** Three cards stay mounted (DESIGN_SYSTEM §6). */
const MOUNTED = 3;
const LIST_ACTIONS = ['offer', 'save', 'skip', 'activate'] as const;

/**
 * SwipeDeck (P6-FEED-02): drag with rotation and stamps, release at 35% or
 * 800 px/s, 220 ms fly-out, one selection haptic at the line, programmatic
 * swipes for the buttons, and a plain list with four actions when a screen
 * reader or reduce motion is on.
 */
export function SwipeDeck({ cards, onSwipe, onOpen, listMode, ref, testID = 'deck' }: Props) {
  const screenReader = useScreenReader();
  const reduced = useReducedMotion();
  const asList = listMode ?? (screenReader || reduced);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const drag = useSharedValue(0);
  const fly = useRef<((dir: SwipeDir) => void) | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      swipe: (dir) => {
        const top = cards[0];
        if (!top) return;
        if (asList || !fly.current) onSwipe(top, dir);
        else fly.current(dir);
      },
    }),
    [cards, asList, onSwipe],
  );

  if (asList) {
    return <DeckList cards={cards} onSwipe={onSwipe} onOpen={onOpen} testID={testID} />;
  }

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  };

  const visible = cards.slice(0, MOUNTED);
  const top = visible[0];

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.stage} onLayout={onLayout}>
        {visible
          .map((card, i) =>
            i === 0 ? (
              <TopCard
                key={card.id}
                card={card}
                size={size}
                drag={drag}
                register={(f) => {
                  fly.current = f;
                }}
                onDone={onSwipe}
                onOpen={onOpen}
              />
            ) : (
              <UnderCard key={card.id} card={card} depth={i} size={size} drag={drag} />
            ),
          )
          .reverse()}
      </View>
      <View style={styles.actions}>
        <IconButton
          icon="x"
          accessibilityLabel={copy.skip}
          filled
          disabled={!top}
          onPress={() => fly.current?.('left')}
          testID={`${testID}-skip`}
        />
        <IconButton
          icon="bookmark"
          accessibilityLabel={copy.save}
          filled
          disabled={!top}
          onPress={() => fly.current?.('save')}
          testID={`${testID}-save`}
        />
        <Tappable
          accessibilityRole="button"
          accessibilityLabel={copy.offer}
          accessibilityState={{ disabled: !top }}
          disabled={!top}
          onPress={() => fly.current?.('right')}
          testID={`${testID}-offer`}
        >
          <View style={styles.offerButton}>
            <Text variant="heading" tone="onAccent">
              $
            </Text>
          </View>
        </Tappable>
      </View>
    </View>
  );
}

type TopProps = {
  card: DeckCard;
  size: { width: number; height: number };
  drag: SharedValue<number>;
  register: (fly: (dir: SwipeDir) => void) => void;
  onDone: (card: DeckCard, dir: SwipeDir) => void;
  onOpen: (card: DeckCard) => void;
};

function TopCard({ card, size, drag, register, onDone, onOpen }: TopProps) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const saving = useSharedValue(0);
  const armed = useSharedValue(false);
  const busy = useSharedValue(false);
  const { width, height } = size;

  // A new top card starts centred, and the card under it starts small, before paint.
  useLayoutEffect(() => {
    drag.set(0);
  }, [drag]);

  const finish = useCallback((dir: SwipeDir) => onDone(card, dir), [card, onDone]);

  const flyOut = useCallback(
    (dir: SwipeDir) => {
      'worklet';
      if (busy.get()) return;
      busy.set(true);
      if (dir === 'save') saving.set(1);
      const to = flyTarget(dir, width || 400, height || 600);
      const cfg = { duration: FLY_MS, reduceMotion: ReduceMotion.Never };
      y.set(withTiming(to.y, cfg));
      x.set(
        withTiming(to.x, cfg, (ok) => {
          if (ok) runOnJS(finish)(dir);
        }),
      );
      drag.set(withTiming(dir === 'save' ? width : to.x, cfg));
    },
    [busy, saving, width, height, x, y, drag, finish],
  );

  useLayoutEffect(() => {
    register((dir) => flyOut(dir));
  }, [register, flyOut]);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      if (busy.get()) return;
      x.set(e.translationX);
      y.set(e.translationY * 0.2);
      drag.set(e.translationX);
      const past = pastThreshold(e.translationX, width);
      if (past && !armed.get()) runOnJS(haptic)('selection');
      armed.set(past);
    })
    .onEnd((e) => {
      if (busy.get()) return;
      const dir = releaseDir(e.translationX, e.velocityX, width);
      if (dir) {
        flyOut(dir);
        return;
      }
      const spring = {
        damping: motion.swipe.damping,
        stiffness: motion.swipe.stiffness,
        reduceMotion: ReduceMotion.Never,
      };
      x.set(withSpring(0, spring));
      y.set(withSpring(0, spring));
      drag.set(withSpring(0, spring));
      armed.set(false);
    });

  const tap = Gesture.Tap().onEnd((_e, ok) => {
    if (ok && !busy.get()) runOnJS(onOpen)(card);
  });

  const moving = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${rotationFor(x.value, width)}deg` },
    ],
  }));
  const offerStamp = useAnimatedStyle(() => ({ opacity: stampOpacity(x.value, width, 'right') }));
  const skipStamp = useAnimatedStyle(() => ({ opacity: stampOpacity(x.value, width, 'left') }));
  const saveStamp = useAnimatedStyle(() => ({ opacity: saving.value }));

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <Animated.View
        style={[styles.cardSlot, moving]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={cardLabel(card)}
        accessibilityHint={copy.cardHint}
        testID={`deck-card-${card.id}`}
      >
        <SwipeCard card={card} />
        <Animated.View style={[styles.stamp, styles.stampLeft, offerStamp]} pointerEvents="none">
          <Text variant="title" tone="onAccent">
            {copy.stampOffer}
          </Text>
        </Animated.View>
        <Animated.View
          style={[styles.stamp, styles.stampRight, styles.stampDark, skipStamp]}
          pointerEvents="none"
        >
          <Text variant="title" tone="inverse">
            {copy.stampSkip}
          </Text>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.stampCenter, saveStamp]} pointerEvents="none">
          <Text variant="title" tone="onAccent">
            {copy.stampSave}
          </Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

type UnderProps = {
  card: DeckCard;
  depth: number;
  size: { width: number; height: number };
  drag: SharedValue<number>;
};

function UnderCard({ card, depth, size, drag }: UnderProps) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: depth === 1 ? nextScale(drag.value, size.width) : NEXT_SCALE }],
    opacity: depth === 1 ? 1 : 0,
  }));
  return (
    <Animated.View
      style={[styles.cardSlot, style]}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <SwipeCard card={card} />
    </Animated.View>
  );
}

type ListProps = {
  cards: DeckCard[];
  onSwipe: (card: DeckCard, dir: SwipeDir) => void;
  onOpen: (card: DeckCard) => void;
  testID: string;
};

/** Screen reader / reduce motion mode (X33): a list, each card with four actions. */
function DeckList({ cards, onSwipe, onOpen, testID }: ListProps) {
  const actions = LIST_ACTIONS.map((name) => ({
    name,
    label:
      name === 'offer'
        ? copy.offer
        : name === 'save'
          ? copy.save
          : name === 'skip'
            ? copy.skip
            : copy.open,
  }));

  return (
    <ScrollView
      contentContainerStyle={styles.list}
      testID={`${testID}-list`}
      accessibilityLabel={copy.listTitle}
    >
      {cards.map((card) => {
        const run = (e: AccessibilityActionEvent) => {
          const name = e.nativeEvent.actionName;
          if (name === 'activate') onOpen(card);
          else if (name === 'offer') onSwipe(card, 'right');
          else if (name === 'save') onSwipe(card, 'save');
          else if (name === 'skip') onSwipe(card, 'left');
        };
        return (
          <View key={card.id} style={styles.listItem}>
            <Tappable
              accessibilityRole="button"
              accessibilityLabel={cardLabel(card)}
              accessibilityActions={actions}
              onAccessibilityAction={run}
              onPress={() => onOpen(card)}
              testID={`deck-item-${card.id}`}
            >
              <View style={styles.listCard}>
                <SwipeCard card={card} />
              </View>
            </Tappable>
            <View style={styles.listButtons} importantForAccessibility="no-hide-descendants">
              <Button
                label={copy.skip}
                variant="secondary"
                size="M"
                onPress={() => onSwipe(card, 'left')}
              />
              <Button
                label={copy.save}
                variant="secondary"
                size="M"
                onPress={() => onSwipe(card, 'save')}
              />
              <Button label={copy.offer} size="M" onPress={() => onSwipe(card, 'right')} />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: { flex: 1 },
  stage: { flex: 1, marginHorizontal: theme.space.screen, marginTop: theme.space.sm },
  cardSlot: { ...StyleSheet.absoluteFillObject },
  stamp: {
    position: 'absolute',
    top: theme.space['2xl'],
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radius.thumb,
    backgroundColor: theme.colors.accent,
  },
  stampLeft: { left: theme.space.xl, transform: [{ rotate: '-10deg' }] },
  stampRight: { right: theme.space.xl, transform: [{ rotate: '10deg' }] },
  stampCenter: { alignSelf: 'center' },
  stampDark: { backgroundColor: theme.colors.ink },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.space.xl,
    paddingVertical: theme.space.lg,
  },
  offerButton: {
    width: theme.size.buttonL,
    height: theme.size.buttonL,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { padding: theme.space.screen, gap: theme.space.xl },
  listItem: { gap: theme.space.md },
  listCard: { aspectRatio: 3 / 4 },
  listButtons: { flexDirection: 'row', gap: theme.space.sm, flexWrap: 'wrap' },
}));
