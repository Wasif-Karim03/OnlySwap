import { useCallback, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { NavBar } from '@/components/NavBar';
import { StepIndicator } from '@/components/Progress';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import { sell as copy } from '@/strings';
import { readableColumn, useLayout } from '@/theme/layout';
import { animateTo, resolveMotion } from '@/theme/motion';
import { useReducedMotion } from '@/theme/reducedMotion';

export const SELL_STEPS = 3;
/** Used until the dock has been measured. */
const DOCK_FALLBACK = 96;

/** The budgeted error shake, as in OTPInput: -8, 8, -6, 0 px, 50 ms each. */
const SHAKE_PX = [-8, 8, -6, 0] as const;
const SHAKE_STEP_MS = 50;

/**
 * Error shake for a dock error line, paired with the `warning` haptic the
 * budget allows (DESIGN_SYSTEM.md:97-102, DESIGN_REVIEW 3.03). With Reduce
 * Motion the line does not move; it fades in (150 ms) and the haptic still
 * fires, as OTPInput does. Presentation only.
 */
export function useErrorShake() {
  const reduced = useReducedMotion();
  const offset = useSharedValue(0);
  const opacity = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: offset.value }],
  }));
  const shake = useCallback(() => {
    haptic('warning');
    if (reduced) {
      opacity.set(0);
      opacity.set(animateTo(1, resolveMotion('fade', true)));
      return;
    }
    offset.set(withSequence(...SHAKE_PX.map((px) => withTiming(px, { duration: SHAKE_STEP_MS }))));
  }, [reduced, offset, opacity]);
  return { style, shake };
}

type Props = {
  step: number;
  leading: 'close' | 'back';
  onLeading: () => void;
  title?: string;
  body?: ReactNode;
  children?: ReactNode;
  /** Pinned above the keyboard (the Next button). */
  dock?: ReactNode;
  /** Over the content, e.g. the restore sheet. */
  overlay?: ReactNode;
  testID: string;
};

/**
 * Frame for the Sell steps (board D1 to D5; DEC 90): "New listing", a thin
 * bar per step, scrolling content and Next docked above the
 * keyboard (T-QA-KB).
 */
export function SellStep({
  step,
  leading,
  onLeading,
  title,
  body,
  children,
  dock,
  overlay,
  testID,
}: Props) {
  return (
    <View style={styles.root} testID={testID}>
      {/* The step count is read out by the bar below ("Step 1 of 3"); no extra label (DEC 90). */}
      <NavBar title={copy.title} leading={leading} onLeading={onLeading} />
      <View style={styles.steps}>
        <StepIndicator step={step} total={SELL_STEPS} />
      </View>
      <DockedScroll dock={dock}>
        {title ? (
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {typeof body === 'string' ? (
          <Text variant="body" tone="ink2" style={styles.body}>
            {body}
          </Text>
        ) : (
          body
        )}
        <View style={styles.children}>{children}</View>
      </DockedScroll>
      {overlay}
    </View>
  );
}

/**
 * Scrolling form content with the primary action docked above the keyboard
 * (T-QA-KB). Shared by the Sell steps and the campus post forms (3.03).
 */
export function DockedScroll({
  children,
  dock,
  standalone = false,
}: {
  children: ReactNode;
  dock?: ReactNode;
  /** Outside the tabs (no tab bar below): the dock pads for the home indicator itself. */
  standalone?: boolean;
}) {
  // These screens live inside the tabs: the tab bar below already covers the
  // home indicator, and it hides while the keyboard is open (app/(tabs)), so
  // the dock rests on the screen edge and rides straight up with the
  // keyboard. The focused field scrolls to sit above the keyboard and the
  // dock, using the dock's measured height (larger text sizes) not a guess.
  const [dockHeight, setDockHeight] = useState(DOCK_FALLBACK);
  const { theme } = useUnistyles();
  const fieldGap = theme.space.lg;
  // iPad sidebar (wide): no tab bar below, so the dock pads for the home
  // indicator itself and drops that padding while the keyboard is up.
  const padsHomeIndicator = useLayout().wide || standalone;
  const insets = useSafeAreaInsets();
  return (
    <>
      <KeyboardAwareScrollView
        bottomOffset={dock ? dockHeight + fieldGap : fieldGap}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {children}
      </KeyboardAwareScrollView>
      {dock ? (
        <KeyboardStickyView
          offset={padsHomeIndicator ? { closed: 0, opened: insets.bottom } : undefined}
        >
          <View
            style={[
              styles.dock,
              padsHomeIndicator ? { paddingBottom: insets.bottom + theme.space.md } : null,
            ]}
            onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)}
          >
            {dock}
          </View>
        </KeyboardStickyView>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  steps: {
    ...readableColumn,
    paddingHorizontal: theme.space.screen,
    paddingBottom: theme.space.sm,
  },
  content: {
    ...readableColumn,
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space['2xl'],
  },
  body: { marginTop: theme.space.xs },
  children: { marginTop: theme.space.lg, gap: theme.space.md },
  dock: {
    ...readableColumn,
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.md,
    gap: theme.space.xs,
    backgroundColor: theme.colors.bg,
  },
}));
