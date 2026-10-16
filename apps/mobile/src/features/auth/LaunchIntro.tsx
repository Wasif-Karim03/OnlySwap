import { usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState } from 'react';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { create } from 'zustand';

import { motion } from '@onlyswap/tokens';

import { HANDOFF_PATHS } from '@/components/Mark';
import { useReducedMotion } from '@/theme/reducedMotion';

import { SPLASH_MARK } from './launchTiming';

/** The Launch screen says when the app has somewhere to go (a route, or the retry). */
export const useLaunchIntro = create<{ ready: boolean; setReady: () => void }>((set) => ({
  ready: false,
  setReady: () => set({ ready: true }),
}));

/** Mark geometry in its 100-unit viewBox: the halves part this far and swap heights (8 = 22 - 14). */
const PART = 7;
const SWAP = 8;
/** Rest between swaps while the app is still loading. */
const REST_MS = motion.success.duration * 2;
/** Backstop: never hold the app behind the cover for more than this many swaps. */
const MAX_SWAPS = 6;

/**
 * Launch animation (DEC 135). Sits over the app on a cold start and starts as
 * an exact copy of the native splash, so hiding the splash is invisible. The
 * two halves of the mark swap places and click back together, a soft accent
 * ring goes out. A slow start repeats the swap, and once the app has routed
 * underneath, the cover fades away after the current swap.
 * Reduce motion: no movement, just the fade.
 */
export function LaunchIntro() {
  const { theme } = useUnistyles();
  const reduced = useReducedMotion();
  const pathname = usePathname();
  const flagged = useLaunchIntro((s) => s.ready);
  // Swaps completed, and whether one is playing. A slow start keeps swapping
  // (a short rest between) so the screen never sits still; it leaves only
  // between swaps.
  const [swaps, setSwaps] = useState(0);
  const [swapping, setSwapping] = useState(true);
  const played = reduced || (swaps > 0 && !swapping);
  // A cold start straight into a deep link never shows the Launch screen.
  const ready = flagged || pathname !== '/' || swaps >= MAX_SWAPS;
  const [gone, setGone] = useState(false);

  const unit = SPLASH_MARK / 100;
  const t = useSharedValue(0);
  const ring = useSharedValue(0);
  const cover = useSharedValue(1);

  const swap = useCallback(() => {
    const part = motion.success.duration / 2;
    const swapped = () => {
      setSwapping(false);
      setSwaps((n) => n + 1);
    };
    ring.set(0);
    t.set(
      withSequence(
        withTiming(1, { duration: part, easing: Easing.inOut(Easing.cubic) }),
        withSpring(0, motion.swipe, (done) => {
          if (done) runOnJS(swapped)();
        }),
      ),
    );
    ring.set(
      withDelay(
        part,
        withTiming(1, { duration: motion.success.duration, easing: Easing.out(Easing.cubic) }),
      ),
    );
  }, [ring, t]);

  const started = useRef(false);
  useEffect(() => {
    if (reduced || started.current) return;
    started.current = true;
    swap();
  }, [reduced, swap]);

  useEffect(() => {
    if (reduced || ready || swapping || swaps === 0) return;
    const timer = setTimeout(() => {
      setSwapping(true);
      swap();
    }, REST_MS);
    return () => clearTimeout(timer);
  }, [reduced, ready, swapping, swaps, swap]);

  useEffect(() => {
    if (!played || !ready) return;
    cover.set(
      withTiming(
        0,
        { duration: motion.fade.duration * 2, easing: Easing.out(Easing.cubic) },
        (done) => {
          if (done) runOnJS(setGone)(true);
        },
      ),
    );
  }, [cover, played, ready]);

  const left = useAnimatedStyle(() => ({
    transform: [{ translateX: -PART * unit * t.value }, { translateY: SWAP * unit * t.value }],
  }));
  const right = useAnimatedStyle(() => ({
    transform: [{ translateX: PART * unit * t.value }, { translateY: -SWAP * unit * t.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - ring.value),
    transform: [{ scale: 0.6 + 1.6 * ring.value }],
  }));
  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.value }));
  const markStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduced ? 1 : 1 + 0.08 * (1 - cover.value) }],
  }));

  if (gone) return null;

  return (
    <Animated.View
      pointerEvents={played && ready ? 'none' : 'auto'}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.cover, coverStyle]}
      testID="launch-intro"
      onLayout={() => void SplashScreen.hideAsync().catch(() => {})}
    >
      <Animated.View style={[styles.center, markStyle]}>
        <Animated.View style={[styles.ring, ringStyle]} />
        {HANDOFF_PATHS.map((d, i) => (
          <Animated.View key={d} style={[styles.half, i === 0 ? left : right]}>
            <Svg width={SPLASH_MARK} height={SPLASH_MARK} viewBox="0 0 100 100">
              <Path d={d} fill={theme.colors.ink} />
            </Svg>
          </Animated.View>
        ))}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  cover: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg,
  },
  center: {
    width: SPLASH_MARK,
    height: SPLASH_MARK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: SPLASH_MARK,
    height: SPLASH_MARK,
    borderRadius: SPLASH_MARK / 2,
    backgroundColor: theme.colors.accent,
  },
  half: { position: 'absolute' },
}));
