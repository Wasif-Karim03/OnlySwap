import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { NavBar } from '@/components/NavBar';
import { StepIndicator } from '@/components/Progress';
import { Text } from '@/components/Text';
import { fill } from '@/lib/format';
import { sell as copy } from '@/strings/en';

export const SELL_STEPS = 3;
/** Used until the dock has been measured. */
const DOCK_FALLBACK = 96;

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
 * Frame for the Sell steps (board D1 to D5): "New listing" with the step
 * count, one bar per step, scrolling content and Next docked above the
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
  // The Sell steps live inside the tabs: the tab bar below already covers the
  // home indicator, and it hides while the keyboard is open (app/(tabs)), so
  // the dock rests on the screen edge and rides straight up with the
  // keyboard. The focused field scrolls to sit above the keyboard and the
  // dock, using the dock's measured height (larger text sizes) not a guess.
  const [dockHeight, setDockHeight] = useState(DOCK_FALLBACK);
  const { theme } = useUnistyles();
  const fieldGap = theme.space.lg;
  return (
    <View style={styles.root} testID={testID}>
      <NavBar
        title={copy.title}
        leading={leading}
        onLeading={onLeading}
        trailing={
          <Text variant="label" tone="ink2">
            {fill(copy.stepCount, { step, total: SELL_STEPS })}
          </Text>
        }
      />
      <View style={styles.steps}>
        <StepIndicator step={step} total={SELL_STEPS} />
      </View>
      <KeyboardAwareScrollView
        bottomOffset={dock ? dockHeight + fieldGap : fieldGap}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
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
      </KeyboardAwareScrollView>
      {dock ? (
        <KeyboardStickyView>
          <View style={styles.dock} onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)}>
            {dock}
          </View>
        </KeyboardStickyView>
      ) : null}
      {overlay}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  steps: { paddingHorizontal: theme.space.screen, paddingBottom: theme.space.sm },
  content: {
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space['2xl'],
  },
  body: { marginTop: theme.space.xs },
  children: { marginTop: theme.space.lg, gap: theme.space.md },
  dock: {
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.md,
    gap: theme.space.xs,
    backgroundColor: theme.colors.bg,
  },
}));
