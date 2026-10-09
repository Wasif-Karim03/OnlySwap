import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';

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
  /** Right side of the nav bar. */
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
  return (
    <View style={styles.root} testID={testID}>
      {step ? (
        <StepNav
          step={step}
          leading={leading}
          onBack={onBack}
          trailing={trailing}
          top={insets.top}
        />
      ) : (
        <NavBar leading={leading} onLeading={onBack} trailing={trailing} />
      )}
      <KeyboardAwareScrollView
        bottomOffset={96}
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
      {dock ? (
        <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
          <View style={[styles.dock, { paddingBottom: insets.bottom + styles.dockGap.height }]}>
            {dock}
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
  trailing,
  top,
}: {
  step: number;
  leading: 'back' | 'none';
  onBack?: () => void;
  trailing?: ReactNode;
  top: number;
}) {
  const router = useRouter();
  const back = onBack ?? (() => router.canGoBack() && router.back());
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
              onPress={back}
              testID="auth-back"
            />
          ) : null}
        </View>
        <Text variant="meta" tone="ink2" style={styles.stepText} testID="auth-step">
          {label}
        </Text>
        <View style={[styles.side, styles.end]}>{trailing}</View>
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
  side: { width: theme.size.hit, flexDirection: 'row', alignItems: 'center' },
  end: { justifyContent: 'flex-end' },
  stepText: { flex: 1, textAlign: 'center', fontWeight: '600' },
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
}));
