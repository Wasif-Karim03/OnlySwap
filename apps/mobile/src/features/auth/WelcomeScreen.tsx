import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { Mark } from '@/components/Mark';
import { Text } from '@/components/Text';
import { welcome as copy } from '@/strings';
import { useReducedMotion } from '@/theme/reducedMotion';

import { WELCOME_ITEMS } from './welcomeAssets';

/**
 * S-A02 Welcome (P4-AUTH-04, DEC 89, design/app-welcome-mock-3.html option 3):
 * a tilted wall of listings drifts on the accent color, one headline, one main
 * action. The wall is decoration only and hidden from screen readers; with
 * Reduce Motion it stands still.
 */

/** The wall is a little wider and taller than the screen so the tilt leaves no gaps. */
const WALL = { tilt: '-12deg', bleedX: 0.18, top: -0.14, height: 0.96 } as const;
/** Tile heights as a share of the column width, repeated down each column. */
const TILE_RATIOS = [1.22, 0.92, 1.46, 1.04, 1.28, 0.98] as const;
const NOTE_RATIO = 0.8;
/** Seconds for one full loop of each column; neighbours run the other way. */
const LANES = [
  { offset: 0, seconds: 40, down: false },
  { offset: 1, seconds: 48, down: true },
  { offset: 2, seconds: 44, down: false },
] as const;
const PER_LANE = 6;

type Tile = { key: string; height: number } & (
  { kind: 'photo'; image: number; price: string } | { kind: 'note'; text: string }
);

/** One column's tiles (one copy; the column draws it twice to loop). Pure, for tests. */
export function laneTiles(offset: number, width: number): Tile[] {
  const tiles: Tile[] = [];
  for (let j = 0; j < PER_LANE; j += 1) {
    if ((j + offset) % 5 === 4) {
      const n = (j + offset) % copy.wall.notes.length;
      tiles.push({
        key: `n${offset}-${j}`,
        kind: 'note',
        text: copy.wall.notes[n] ?? '',
        height: Math.round(width * NOTE_RATIO),
      });
    } else {
      const k = (j * 3 + offset) % WELCOME_ITEMS.length;
      tiles.push({
        key: `p${offset}-${j}`,
        kind: 'photo',
        image: WELCOME_ITEMS[k] ?? 0,
        price: copy.wall.prices[k] ?? '',
        height: Math.round(width * (TILE_RATIOS[(j + offset) % TILE_RATIOS.length] ?? 1)),
      });
    }
  }
  return tiles;
}

export function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { theme } = useUnistyles();
  const reduced = useReducedMotion();

  const bleed = Math.round(width * WALL.bleedX);
  const wallWidth = width + bleed * 2;
  const gap = theme.space.md;
  const colWidth = (wallWidth - gap * 4) / 3;

  return (
    <View style={styles.root} testID="screen-welcome">
      <StatusBar style="dark" />
      <View
        style={StyleSheet.absoluteFill}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        <View
          style={[
            styles.wall,
            {
              top: Math.round(height * WALL.top),
              left: -bleed,
              width: wallWidth,
              height: Math.round(height * WALL.height),
              transform: [{ rotate: WALL.tilt }],
            },
          ]}
        >
          {LANES.map((lane) => (
            <Lane
              key={lane.offset}
              tiles={laneTiles(lane.offset, colWidth)}
              gap={gap}
              seconds={lane.seconds}
              down={lane.down}
              still={reduced}
            />
          ))}
        </View>
        <Fade color={theme.colors.accent} edge="top" height={Math.round(height * 0.16)} />
        <Fade color={theme.colors.accent} edge="bottom" height={Math.round(height * 0.56)} />
      </View>

      <View style={[styles.brand, { paddingTop: insets.top }]}>
        <Mark size={26} tone="onAccent" />
        <Text variant="heading" tone="onAccent" style={styles.wordmark}>
          {copy.wordmark}
        </Text>
      </View>

      <View style={[styles.content, { paddingBottom: insets.bottom + theme.space.md }]}>
        <Text variant="display" tone="onAccent" accessibilityRole="header">
          {copy.title}
        </Text>
        <Text variant="body" tone="onAccent" style={styles.body}>
          {copy.body}
        </Text>
        <View style={styles.actions}>
          <Button
            label={copy.continue}
            variant="onAccent"
            onPress={() => router.push('/email')}
            testID="welcome-continue"
          />
          <Button
            label={copy.signIn}
            variant="textOnAccent"
            accessibilityHint={copy.signInHint}
            onPress={() => router.push('/email?mode=login')}
            testID="welcome-sign-in"
          />
        </View>
      </View>
    </View>
  );
}

/** One column; draws its tiles twice and slides by one copy, so the loop is seamless. */
function Lane({
  tiles,
  gap,
  seconds,
  down,
  still,
}: {
  tiles: Tile[];
  gap: number;
  seconds: number;
  down: boolean;
  still: boolean;
}) {
  const copyHeight = tiles.reduce((sum, t) => sum + t.height + gap, 0);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (still) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: seconds * 1000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [still, seconds, progress]);

  const moving = useAnimatedStyle(() => ({
    transform: [
      { translateY: down ? -copyHeight * (1 - progress.value) : -copyHeight * progress.value },
    ],
  }));

  return (
    <View style={styles.lane}>
      <Animated.View style={[styles.laneInner(gap), moving]}>
        {[0, 1].map((round) =>
          tiles.map((t) =>
            t.kind === 'photo' ? (
              <View key={`${round}${t.key}`} style={[styles.tile, { height: t.height }]}>
                <Image
                  source={t.image}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
                <View style={styles.tag}>
                  <Text variant="label" style={styles.tagText}>
                    {t.price}
                  </Text>
                </View>
              </View>
            ) : (
              <View
                key={`${round}${t.key}`}
                style={[styles.tile, styles.note, { height: t.height }]}
              >
                <Text variant="label" style={styles.noteText}>
                  {t.text}
                </Text>
              </View>
            ),
          ),
        )}
      </Animated.View>
    </View>
  );
}

/**
 * Accent fade over the photo wall so the brand and headline sit on a clean
 * field (the photo scrim DESIGN_SYSTEM §8 allows, in the accent color, DEC 89).
 */
function Fade({ color, edge, height }: { color: string; edge: 'top' | 'bottom'; height: number }) {
  const id = `welcomeFade-${edge}`;
  const stops =
    edge === 'top'
      ? [
          { offset: '0', opacity: 1 },
          { offset: '0.5', opacity: 1 },
          { offset: '1', opacity: 0 },
        ]
      : [
          { offset: '0', opacity: 0 },
          { offset: '0.34', opacity: 1 },
          { offset: '1', opacity: 1 },
        ];
  return (
    <View style={[styles.fade, edge === 'top' ? styles.fadeTop : styles.fadeBottom, { height }]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1 1">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            {stops.map((s) => (
              <Stop key={s.offset} offset={s.offset} stopColor={color} stopOpacity={s.opacity} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="1" height="1" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.accent, overflow: 'hidden' },
  wall: {
    position: 'absolute',
    flexDirection: 'row',
    gap: theme.space.md,
    paddingHorizontal: theme.space.md,
    overflow: 'hidden',
  },
  lane: { flex: 1 },
  laneInner: (gap: number) => ({ gap }),
  tile: {
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    backgroundColor: theme.colors.bg2,
  },
  tag: {
    position: 'absolute',
    left: theme.space.sm,
    bottom: theme.space.sm,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radius.thumb,
    backgroundColor: theme.colors.card,
  },
  tagText: { color: theme.colors.ink, fontWeight: '800' },
  note: {
    justifyContent: 'flex-end',
    padding: theme.space.md,
    backgroundColor: theme.colors.card,
  },
  noteText: { color: theme.colors.ink, fontWeight: '700' },
  fade: { position: 'absolute', left: 0, right: 0 },
  fadeTop: { top: 0 },
  fadeBottom: { bottom: 0 },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.xl,
    marginTop: theme.space.sm,
  },
  wordmark: { fontWeight: '800' },
  content: {
    marginTop: 'auto',
    paddingHorizontal: theme.space.xl,
  },
  body: { marginTop: theme.space.sm },
  actions: { marginTop: theme.space.xl, gap: theme.space.xs },
}));
