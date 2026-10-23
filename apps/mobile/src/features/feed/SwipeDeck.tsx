import {
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
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
import { Icon } from '@/components/icons/Icon';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { useScreenReader, a11yState } from '@/lib/a11y';
import { haptic } from '@/lib/haptics';
import { feed as copy } from '@/strings';
import { LAYOUT, gridCellWidth, gridColumns } from '@/theme/layout';
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
  /**
   * iPad, wide window (board N5): a grid instead of swiping, laid out for this
   * many points of width. Each tile keeps the list mode's Skip, Save and Offer.
   */
  gridWidth?: number;
  /**
   * One quiet line in the thumb zone (DESIGN_REVIEW 3.02): above the action
   * row in the deck, at the top of the list or grid.
   */
  hint?: ReactNode;
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
export function SwipeDeck({
  cards,
  onSwipe,
  onOpen,
  listMode,
  gridWidth,
  hint,
  ref,
  testID = 'deck',
}: Props) {
  const screenReader = useScreenReader();
  const reduced = useReducedMotion();
  const asList = gridWidth !== undefined || (listMode ?? (screenReader || reduced));

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
    return (
      <DeckList
        cards={cards}
        onSwipe={onSwipe}
        onOpen={onOpen}
        gridWidth={gridWidth}
        hint={hint}
        testID={testID}
      />
    );
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
      {hint ? <View style={styles.hint}>{hint}</View> : null}
      <DeckActions
        size="L"
        disabled={!top}
        onSkip={() => fly.current?.('left')}
        onOffer={() => fly.current?.('right')}
        onSave={() => fly.current?.('save')}
        testID={testID}
      />
    </View>
  );
}

type ActionsProps = {
  /** `L` under the deck, `M` under list and grid tiles. */
  size: 'L' | 'M';
  /** Narrow grid tiles say "Offer" instead of "Make an offer". */
  short?: boolean;
  disabled?: boolean;
  onSkip: () => void;
  onOffer: () => void;
  onSave: () => void;
  testID: string;
};

/**
 * Skip, Make an offer, Save (DESIGN_REVIEW 3.02, replacing the DEC 90 mock
 * screen 4 choice of an ink pill and an accent heart): quiet hairline circles
 * either side, no shadow, and the wide offer pill as the screen's one accent
 * fill (P2, P7), with ink words on it.
 */
function DeckActions({ size, short, disabled, onSkip, onOffer, onSave, testID }: ActionsProps) {
  const icon = size === 'L' ? 26 : 22;
  return (
    <View style={styles.actions(size)}>
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={copy.skip}
        {...a11yState({ disabled: !!disabled })}
        disabled={disabled}
        onPress={onSkip}
        testID={`${testID}-skip`}
      >
        <View style={styles.circle(size, !!disabled)}>
          <Icon name="x" size={icon} />
        </View>
      </Tappable>
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={copy.offer}
        {...a11yState({ disabled: !!disabled })}
        disabled={disabled}
        onPress={onOffer}
        style={styles.offerFlex}
        testID={`${testID}-offer`}
      >
        <View style={styles.offerPill(size, !!disabled)}>
          <Text variant={size === 'L' ? 'bodyStrong' : 'label'} tone="onAccent" numberOfLines={1}>
            {short ? copy.offerShort : copy.offer}
          </Text>
        </View>
      </Tappable>
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={copy.save}
        {...a11yState({ disabled: !!disabled })}
        disabled={disabled}
        onPress={onSave}
        testID={`${testID}-save`}
      >
        <View style={styles.circle(size, !!disabled)}>
          <Icon name="heart" size={icon} />
        </View>
      </Tappable>
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
  gridWidth?: number;
  hint?: ReactNode;
  testID: string;
};

/**
 * Screen reader / reduce motion mode (X33): a list, each card with four
 * actions. With `gridWidth` (iPad N5) the same tiles wrap into columns.
 */
function DeckList({ cards, onSwipe, onOpen, gridWidth, hint, testID }: ListProps) {
  const columns = gridWidth !== undefined ? gridColumns(gridWidth) : 1;
  const cellWidth = gridWidth !== undefined ? gridCellWidth(gridWidth, columns) : undefined;
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
      contentContainerStyle={cellWidth !== undefined ? styles.grid : styles.list}
      testID={`${testID}-list`}
      accessibilityLabel={copy.listTitle}
    >
      {hint ? <View style={styles.listHint}>{hint}</View> : null}
      {cards.map((card) => {
        const run = (e: AccessibilityActionEvent) => {
          const name = e.nativeEvent.actionName;
          if (name === 'activate') onOpen(card);
          else if (name === 'offer') onSwipe(card, 'right');
          else if (name === 'save') onSwipe(card, 'save');
          else if (name === 'skip') onSwipe(card, 'left');
        };
        return (
          <View
            key={card.id}
            style={[styles.listItem, cellWidth !== undefined ? { width: cellWidth } : null]}
            testID={cellWidth !== undefined ? `deck-tile-${card.id}` : undefined}
          >
            <Tappable
              accessibilityRole="button"
              accessibilityLabel={cardLabel(card)}
              accessibilityActions={actions}
              onAccessibilityAction={run}
              onPress={() => onOpen(card)}
              testID={`deck-item-${card.id}`}
            >
              <View style={styles.listCard(cellWidth !== undefined)}>
                <SwipeCard card={card} compact={cellWidth !== undefined} />
              </View>
            </Tappable>
            <View importantForAccessibility="no-hide-descendants">
              <DeckActions
                size="M"
                short={cellWidth !== undefined}
                onSkip={() => onSwipe(card, 'left')}
                onOffer={() => onSwipe(card, 'right')}
                onSave={() => onSwipe(card, 'save')}
                testID={`deck-item-${card.id}`}
              />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: { flex: 1 },
  hint: { paddingHorizontal: theme.space.screen, paddingTop: theme.space.md },
  listHint: { width: '100%' },
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
  actions: (size: 'L' | 'M') => ({
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: size === 'L' ? theme.space.lg : theme.space.sm,
    paddingVertical: size === 'L' ? theme.space.lg : 0,
    // The deck row spans the screen so the offer pill can be the wide primary.
    paddingHorizontal: size === 'L' ? theme.space.screen : 0,
  }),
  circle: (size: 'L' | 'M', disabled: boolean) => ({
    width: size === 'L' ? theme.size.buttonL : theme.size.hit,
    height: size === 'L' ? theme.size.buttonL : theme.size.hit,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    // Quiet: a card fill and the hairline, no shadow (DESIGN_SYSTEM §4).
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
    opacity: disabled ? 0.35 : 1,
  }),
  offerFlex: { flex: 1 },
  offerPill: (size: 'L' | 'M', disabled: boolean) => ({
    height: size === 'L' ? theme.size.buttonL : theme.size.hit,
    paddingHorizontal: size === 'L' ? theme.space.xl : theme.space.md,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
    opacity: disabled ? 0.35 : 1,
  }),
  list: {
    padding: theme.space.screen,
    gap: theme.space.xl,
    width: '100%',
    maxWidth: LAYOUT.readableMax,
    alignSelf: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: theme.space.screen,
    columnGap: theme.space.md,
    rowGap: theme.space.xl,
  },
  listItem: { gap: theme.space.md },
  // The card is photo plus a white text block; narrow grid tiles get a taller
  // shape so the photo keeps most of the tile.
  listCard: (grid: boolean) => ({ aspectRatio: grid ? 0.6 : 3 / 4 }),
}));
