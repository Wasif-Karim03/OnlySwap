import {
  useCallback,
  useEffect,
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
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { motion } from '@onlyswap/tokens';
import { Icon } from '@/components/icons/Icon';
import { Material } from '@/components/Material';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { useScreenReader, a11yState } from '@/lib/a11y';
import { haptic } from '@/lib/haptics';
import { fill } from '@/lib/format';
import { feed as copy } from '@/strings';
import { LAYOUT, gridCellWidth, gridColumns } from '@/theme/layout';
import { useReducedMotion } from '@/theme/reducedMotion';

import {
  FLY_MS,
  flyTarget,
  PEEK,
  pastThreshold,
  pileFor,
  releaseDir,
  rotationFor,
  stampOpacity,
  tapZone,
  type SwipeDir,
} from './deckMath';
import { cardLabel, SaveButton, SwipeCard, type DeckCard } from './SwipeCard';

export type SwipeDeckHandle = {
  /** Button presses and tests: fly the top card out as if swiped. */
  swipe: (dir: SwipeDir) => void;
};

type Props = {
  /** Cards still to see, top first. The screen removes a card after `onSwipe`. */
  cards: DeckCard[];
  onSwipe: (card: DeckCard, dir: SwipeDir) => void;
  onOpen: (card: DeckCard) => void;
  /**
   * The bookmark (DEC 144): saving keeps the card where it is. Without it,
   * Save falls back to `onSwipe(card, 'save')`.
   */
  onToggleSave?: (card: DeckCard) => void;
  /** First time only: the top card wiggles once to show it moves. */
  wiggle?: boolean;
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
  onToggleSave,
  wiggle = false,
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
        onToggleSave={onToggleSave}
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

  return (
    <View style={styles.wrap} testID={testID}>
      {hint ? <View style={styles.hint}>{hint}</View> : null}
      <View style={styles.stage} onLayout={onLayout}>
        {visible
          .map((card, i) =>
            i === 0 ? (
              <TopCard
                key={card.id}
                card={card}
                size={size}
                drag={drag}
                wiggle={wiggle}
                register={(f) => {
                  fly.current = f;
                }}
                onDone={onSwipe}
                onOpen={onOpen}
                onToggleSave={onToggleSave ?? ((c) => onSwipe(c, 'save'))}
              />
            ) : (
              <UnderCard key={card.id} card={card} depth={i} size={size} drag={drag} />
            ),
          )
          .reverse()}
      </View>
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
  /** Fills the bookmark when the item is already saved (DEC 144: bookmark = save). */
  saved?: boolean;
  testID: string;
};

/**
 * Skip, Make an offer, Save (DESIGN_REVIEW 3.02, replacing the DEC 90 mock
 * screen 4 choice of an ink pill and an accent heart): quiet hairline circles
 * either side, no shadow, and the wide offer pill as the screen's one accent
 * fill (P2, P7), with ink words on it.
 */
function DeckActions({
  size,
  short,
  disabled,
  onSkip,
  onOffer,
  onSave,
  saved = false,
  testID,
}: ActionsProps) {
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
        <CircleSurface size={size} disabled={!!disabled}>
          <Icon name="x" size={icon} tone={size === 'L' ? 'onPhoto' : 'ink'} />
        </CircleSurface>
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
        accessibilityLabel={saved ? copy.unsaveAction : copy.save}
        {...a11yState({ disabled: !!disabled, selected: saved })}
        disabled={disabled}
        onPress={onSave}
        testID={`${testID}-save`}
      >
        <CircleSurface size={size} disabled={!!disabled}>
          <Icon
            name="bookmark"
            size={icon}
            tone={size === 'L' ? 'onPhoto' : 'ink'}
            filled={saved}
          />
        </CircleSurface>
      </Tappable>
    </View>
  );
}

/**
 * The side buttons. On the deck they float over the photo, so they use the
 * clear material (round 2); under list and grid tiles they stay quiet circles.
 */
function CircleSurface({
  size,
  disabled,
  children,
}: {
  size: 'L' | 'M';
  disabled: boolean;
  children: ReactNode;
}) {
  if (size === 'L') {
    return (
      // Solid: the row floats over the moving card, and glass there redrew every frame.
      <Material variant="clear" solid style={styles.glassCircle(disabled)}>
        {children}
      </Material>
    );
  }
  return <View style={styles.circle(size, disabled)}>{children}</View>;
}

type TopProps = {
  card: DeckCard;
  size: { width: number; height: number };
  drag: SharedValue<number>;
  wiggle: boolean;
  register: (fly: (dir: SwipeDir) => void) => void;
  onDone: (card: DeckCard, dir: SwipeDir) => void;
  onOpen: (card: DeckCard) => void;
  onToggleSave: (card: DeckCard) => void;
};

/** The right-swipe sticker: the asking price, or "Ask for it" for free things. */
export function offerSticker(card: DeckCard): string {
  return card.free ? copy.stampAsk : fill(copy.stampOfferPrice, { price: card.price });
}

function deckActions(saved: boolean) {
  return [
    { name: 'offer', label: copy.offer },
    { name: 'skip', label: copy.skip },
    { name: 'save', label: saved ? copy.unsaveAction : copy.save },
    { name: 'activate', label: copy.open },
  ];
}

function TopCard({ card, size, drag, wiggle, register, onDone, onOpen, onToggleSave }: TopProps) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const armed = useSharedValue(false);
  const busy = useSharedValue(false);
  const [photo, setPhoto] = useState(0);
  const { width, height } = size;

  // A new top card starts centred, and the card under it starts small, before paint.
  useLayoutEffect(() => {
    drag.set(0);
  }, [drag]);

  // First time only (round 2 frame 5): one small wiggle shows the card moves.
  useEffect(() => {
    if (!wiggle || width <= 0) return;
    const step = { duration: 180, reduceMotion: ReduceMotion.System };
    x.set(
      withDelay(
        500,
        withSequence(
          withTiming(-width * 0.08, step),
          withTiming(width * 0.06, step),
          withTiming(0, step),
        ),
      ),
    );
  }, [wiggle, width, x]);

  const finish = useCallback((dir: SwipeDir) => onDone(card, dir), [card, onDone]);

  const flyOut = useCallback(
    (dir: SwipeDir) => {
      'worklet';
      if (busy.get()) return;
      busy.set(true);
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
    [busy, width, height, x, y, drag, finish],
  );

  useLayoutEffect(() => {
    register((dir) => flyOut(dir));
  }, [register, flyOut]);

  const count = card.photos.length;
  const flip = useCallback(
    (by: number) => {
      setPhoto((i) => Math.min(Math.max(i + by, 0), Math.max(count - 1, 0)));
      haptic('selection');
    },
    [count],
  );

  const onTap = useCallback(
    (tapX: number) => {
      const zone = count > 1 ? tapZone(tapX, width) : 'open';
      if (zone === 'prev') flip(-1);
      else if (zone === 'next') flip(1);
      else onOpen(card);
    },
    [count, width, flip, onOpen, card],
  );

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

  const tap = Gesture.Tap().onEnd((e, ok) => {
    if (ok && !busy.get()) runOnJS(onTap)(e.x);
  });

  const moving = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${rotationFor(x.value, width)}deg` },
    ],
  }));
  const offerStamp = useAnimatedStyle(() => ({ opacity: stampOpacity(x.value, width, 'right') }));
  const passStamp = useAnimatedStyle(() => ({ opacity: stampOpacity(x.value, width, 'left') }));

  const onAction = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    if (name === 'offer') flyOut('right');
    else if (name === 'skip') flyOut('left');
    else if (name === 'save') onToggleSave(card);
    else if (name === 'activate') onOpen(card);
  };

  return (
    <Animated.View style={[styles.cardSlot, moving]}>
      <GestureDetector gesture={Gesture.Race(pan, tap)}>
        <Animated.View
          style={styles.fill}
          accessible
          accessibilityRole="button"
          accessibilityLabel={cardLabel(card)}
          accessibilityHint={copy.cardHint}
          accessibilityActions={deckActions(!!card.saved)}
          onAccessibilityAction={onAction}
          testID={`deck-card-${card.id}`}
        >
          <SwipeCard card={card} overlay photoIndex={photo} />
          {/* Stickers (round 2): the price on the right swipe, "Pass" on the left. */}
          <Animated.View
            style={[styles.sticker, styles.stickerOffer, offerStamp]}
            pointerEvents="none"
          >
            <Text variant="title" tone="onAccent">
              {offerSticker(card)}
            </Text>
          </Animated.View>
          <Animated.View
            style={[styles.sticker, styles.stickerPass, passStamp]}
            pointerEvents="none"
          >
            <Text variant="title" style={styles.passText}>
              {copy.stampSkip}
            </Text>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
      {/* Outside the swipe area, so tapping it never flips a photo or opens the listing. */}
      <SaveButton saved={!!card.saved} onPress={() => onToggleSave(card)} />
    </Animated.View>
  );
}

type UnderProps = {
  card: DeckCard;
  depth: number;
  size: { width: number; height: number };
  drag: SharedValue<number>;
};

function UnderCard({ card, depth, size, drag }: UnderProps) {
  const style = useAnimatedStyle(() => {
    const pile = pileFor(depth, drag.value, size.width);
    return { transform: [{ translateY: pile.y }, { scale: pile.scale }] };
  });
  return (
    <Animated.View
      style={[styles.cardSlot, style]}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <SwipeCard card={card} overlay />
    </Animated.View>
  );
}

type ListProps = {
  cards: DeckCard[];
  onSwipe: (card: DeckCard, dir: SwipeDir) => void;
  onOpen: (card: DeckCard) => void;
  onToggleSave?: (card: DeckCard) => void;
  gridWidth?: number;
  hint?: ReactNode;
  testID: string;
};

/**
 * Screen reader / reduce motion mode (X33): a list, each card with four
 * actions. With `gridWidth` (iPad N5) the same tiles wrap into columns.
 */
function DeckList({ cards, onSwipe, onOpen, onToggleSave, gridWidth, hint, testID }: ListProps) {
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

  // Saving keeps the card in the list too (DEC 144).
  const save = (card: DeckCard) => (onToggleSave ? onToggleSave(card) : onSwipe(card, 'save'));

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
          else if (name === 'save') save(card);
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
                onSave={() => save(card)}
                saved={!!card.saved}
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
  hint: { paddingHorizontal: theme.space.screen, paddingBottom: theme.space.sm },
  listHint: { width: '100%' },
  // Room under the top card for the pile to peek out (round 2 "Depth").
  stage: {
    flex: 1,
    marginHorizontal: theme.space.md,
    marginTop: theme.space.xs,
    marginBottom: PEEK + theme.space.md,
  },
  cardSlot: { ...StyleSheet.absoluteFillObject },
  fill: { flex: 1 },
  // Round 2 stickers: a tilted label, like a sticker slapped on the photo.
  sticker: {
    position: 'absolute',
    // Below the photo bars and the bookmark.
    top: theme.size.hit + theme.space['2xl'],
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radius.thumb,
  },
  // Each sticker sits on the side the card swings away from, so it stays on screen.
  stickerOffer: {
    left: theme.space.xl,
    backgroundColor: theme.colors.accent,
    transform: [{ rotate: '-8deg' }],
  },
  stickerPass: {
    right: theme.space.xl,
    backgroundColor: theme.colors.onPhoto,
    transform: [{ rotate: '8deg' }],
  },
  // White sticker, so its word is the dark on-accent ink in both themes.
  passText: { color: theme.colors.onAccent },
  actions: (size: 'L' | 'M') => ({
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: size === 'L' ? theme.space.lg : theme.space.sm,
    paddingVertical: size === 'L' ? theme.space.lg : 0,
    // The deck row floats over the card's foot (round 2): it overlaps the
    // stage by its own height, and the card leaves that room under its text.
    marginTop: size === 'L' ? -(theme.size.buttonL + theme.space.lg * 2) : 0,
    paddingHorizontal: size === 'L' ? theme.space.xl + theme.space.sm : 0,
  }),
  glassCircle: (disabled: boolean) => ({
    width: theme.size.buttonL,
    height: theme.size.buttonL,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: disabled ? 0.35 : 1,
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
