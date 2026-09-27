import { useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { animateTo, resolveMotion } from '@/theme/motion';
import { useReducedMotion } from '@/theme/reducedMotion';

import { Photo } from './Photo';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const DOUBLE_TAP_ZOOM = 2.5;
/** Swipe-down distance or speed that closes the viewer at 1x (board B10). */
export const DISMISS_DISTANCE = 120;
export const DISMISS_VELOCITY = 800;

export function clampZoom(scale: number): number {
  'worklet';
  return Math.min(Math.max(scale, MIN_ZOOM), MAX_ZOOM);
}

/** Keeps a zoomed image from being dragged past its own edges. */
export function clampPan(offset: number, scale: number, size: number): number {
  'worklet';
  const max = Math.max(0, (size * (scale - 1)) / 2);
  return Math.min(Math.max(offset, -max), max);
}

/** Close on a downward swipe, only when not zoomed in. */
export function shouldDismiss(scale: number, translationY: number, velocityY: number): boolean {
  'worklet';
  return (
    scale <= MIN_ZOOM + 0.01 && (translationY > DISMISS_DISTANCE || velocityY > DISMISS_VELOCITY)
  );
}

type Props = {
  source: string | number | null;
  blurhash?: string | null;
  accessibilityLabel: string;
  /** Swipe down at 1x. */
  onDismiss?: () => void;
  testID?: string;
};

/**
 * Full-screen photo (P2-CMP-07, board B10): pinch to zoom 1x to 4x, double-tap
 * to zoom in or reset, drag when zoomed, swipe down at 1x to close. With reduce
 * motion, snaps use the 150 ms fade timing instead of springs.
 */
export function ZoomableImage({ source, blurhash, accessibilityLabel, onDismiss, testID }: Props) {
  const reduced = useReducedMotion();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const snap = resolveMotion('sheet', reduced);
  const { width, height } = size;

  const reset = () => {
    'worklet';
    scale.set(animateTo(1, snap));
    savedScale.set(1);
    x.set(animateTo(0, snap));
    y.set(animateTo(0, snap));
    savedX.set(0);
    savedY.set(0);
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.set(clampZoom(savedScale.get() * e.scale));
    })
    .onEnd(() => {
      savedScale.set(scale.get());
      if (scale.get() <= MIN_ZOOM + 0.01) reset();
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      const s = scale.get();
      if (s <= MIN_ZOOM + 0.01) {
        // At 1x only a downward drag moves the photo (swipe to close).
        y.set(Math.max(0, e.translationY));
        return;
      }
      x.set(clampPan(savedX.get() + e.translationX, s, width));
      y.set(clampPan(savedY.get() + e.translationY, s, height));
    })
    .onEnd((e) => {
      const s = scale.get();
      if (s <= MIN_ZOOM + 0.01) {
        if (onDismiss && shouldDismiss(s, e.translationY, e.velocityY)) {
          runOnJS(onDismiss)();
        } else {
          y.set(animateTo(0, snap));
        }
        return;
      }
      savedX.set(x.get());
      savedY.set(y.get());
    });

  // maxDistance: a finger that moves is a drag, so the pan starts right away
  // instead of waiting for the double-tap window to run out.
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDistance(10)
    .onEnd(() => {
      if (scale.get() > MIN_ZOOM + 0.01) {
        reset();
      } else {
        scale.set(animateTo(DOUBLE_TAP_ZOOM, snap));
        savedScale.set(DOUBLE_TAP_ZOOM);
      }
    });

  const gesture = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        testID={testID}
        style={styles.fill}
        onLayout={(e) =>
          setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
        }
      >
        <Animated.View style={[styles.center, imageStyle]}>
          <Photo
            source={source}
            blurhash={blurhash}
            accessibilityLabel={accessibilityLabel}
            contentFit="contain"
            backdrop={false}
            aspectRatio={width > 0 && height > 0 ? width / height : 1}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  center: { flex: 1, justifyContent: 'center' },
});
