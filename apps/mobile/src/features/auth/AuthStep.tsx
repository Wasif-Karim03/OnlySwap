import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { IconButton } from '@/components/IconButton';
import { NavBar } from '@/components/NavBar';
import { stepLabel } from '@/components/Progress';
import { Text } from '@/components/Text';
import { nav as navCopy } from '@/strings';
import { readableColumn } from '@/theme/layout';

/** Sign-up steps: email, code, birthday, profile, rules (A03 to A07). */
export const SIGNUP_STEPS = 5;

type Props = {
  title: string;
  body?: ReactNode;
  /** `back` for pushed steps; `none` when there is nowhere to go back to. */
  leading?: 'back' | 'none';
  onBack?: () => void;
  /**
   * A secondary text action ("Not you? Sign out"). Right side of the nav bar
   * without `step`; with `step` it sits centered under the dock, since the
   * step nav's side slot is too narrow for it.
   */
  trailing?: ReactNode;
  /**
   * Sign-up position, 1 to SIGNUP_STEPS: "Step 2 of 5" centered in the nav
   * with a thin progress bar under it (DEC 90, mock screens 1 and 2).
   */
  step?: number;
  children?: ReactNode;
  /** Buttons pinned above the keyboard (board `dock`). */
  dock?: ReactNode;
  testID: string;
};

/**
 * Shared frame for the sign-in and onboarding steps (A03 to A07): nav bar,
 * a large title, scrolling content, and the main action docked above the
 * keyboard so it never hides behind it.
 */
export function AuthStep({
  title,
  body,
  leading = 'back',
  onBack,
  trailing,
  step,
  children,
  dock,
  testID,
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const router = useRouter();
  // Height of the dock as it shows above the keyboard: the sticky view drops
  // the bottom inset while the keyboard is up (offset `opened` below).
  const [dockH, setDockH] = useState<number | null>(null);
  // Keep the focused field (plus one feedback line under it) clear of the dock.
  // 96 is the old fixed guess, used until the dock has been measured.
  const bottomOffset = dockH === null ? 96 : dockH + theme.space.xl + theme.space['2xl'];
  const dockedTrailing = step ? trailing : null;
  // With no history (opened by replace or a link) back still leaves for welcome.
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/welcome')));
  return (
    <View style={styles.root} testID={testID}>
      {step ? (
        <StepNav step={step} leading={leading} onBack={back} top={insets.top} />
      ) : (
        <NavBar leading={leading} onLeading={back} trailing={trailing} />
      )}
      <KeyboardAwareScrollView
        bottomOffset={bottomOffset}
        // The dock rides up over this view with the keyboard; leave room to
        // scroll past it, or a field under the focused one (Password) is out of reach.
        extraKeyboardSpace={dockH ?? 0}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content(!!step)}
      >
        <Text variant="display" accessibilityRole="header">
          {title}
        </Text>
        {typeof body === 'string' ? (
          <Text variant="body" tone="ink2" style={styles.body}>
            {body}
          </Text>
        ) : (
          body
        )}
        <View style={styles.children}>{children}</View>
      </KeyboardAwareScrollView>
      {dock || dockedTrailing ? (
        <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
          <View
            testID="auth-dock"
            onLayout={(e) => setDockH(Math.max(0, e.nativeEvent.layout.height - insets.bottom))}
            style={[styles.dock, { paddingBottom: insets.bottom + styles.dockGap.height }]}
          >
            {dock}
            {dockedTrailing ? <View style={styles.dockTrailing}>{dockedTrailing}</View> : null}
          </View>
        </KeyboardStickyView>
      ) : null}
    </View>
  );
}

/** Back, "Step n of 5" in the middle, and the thin ink progress bar. */
function StepNav({
  step,
  leading,
  onBack,
  top,
}: {
  step: number;
  leading: 'back' | 'none';
  onBack: () => void;
  top: number;
}) {
  const current = Math.min(Math.max(Math.round(step), 1), SIGNUP_STEPS);
  const label = stepLabel(current, SIGNUP_STEPS);
  return (
    <View style={{ paddingTop: top }}>
      <View style={styles.nav}>
        <View style={styles.side}>
          {leading === 'back' ? (
            <IconButton
              icon="back"
              filled
              accessibilityLabel={navCopy.back}
              onPress={onBack}
              testID="auth-back"
            />
          ) : null}
        </View>
        <Text variant="meta" tone="ink2" style={styles.stepText} testID="auth-step">
          {label}
        </Text>
        {/* Empty, but the same width as the back side so the label stays centred. */}
        <View style={styles.side} />
      </View>
      <View
        style={styles.track}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 1, max: SIGNUP_STEPS, now: current }}
        testID="auth-progress"
      >
        <View style={[styles.fill, { width: `${(current / SIGNUP_STEPS) * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.size.navBar,
    paddingHorizontal: theme.space.md,
  },
  // Both sides share the leftover width equally, so the step label stays
  // centred. Text actions go in the dock instead (see `trailing`): even half
  // the bar wrapped "Not you? Sign out" to 2 to 4 lines.
  side: {
    flex: 1,
    minWidth: theme.size.hit,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepText: { flexShrink: 0, textAlign: 'center', fontWeight: '600' },
  track: {
    height: theme.size.stepBar,
    marginHorizontal: theme.space.screen,
    marginTop: theme.space.xs,
    borderRadius: theme.radius.chip,
    overflow: 'hidden',
    backgroundColor: theme.colors.bg3,
  },
  fill: { height: '100%', borderRadius: theme.radius.chip, backgroundColor: theme.colors.ink },
  content: (stepped: boolean) => ({
    ...readableColumn,
    paddingHorizontal: theme.space.screen,
    paddingTop: stepped ? theme.space.xl : theme.space.sm,
    paddingBottom: theme.space['2xl'],
  }),
  body: { marginTop: theme.space.sm },
  children: { marginTop: theme.space.xl, gap: theme.space.md },
  dock: {
    ...readableColumn,
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.sm,
    gap: theme.space.xs,
    backgroundColor: theme.colors.bg,
  },
  dockGap: { height: theme.space.md },
  dockTrailing: { alignItems: 'center' },
}));
