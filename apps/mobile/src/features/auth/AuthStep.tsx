import type { ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';

import { NavBar } from '@/components/NavBar';
import { Text } from '@/components/Text';

type Props = {
  title: string;
  body?: ReactNode;
  /** `back` for pushed steps; `none` when there is nowhere to go back to. */
  leading?: 'back' | 'none';
  onBack?: () => void;
  /** Right side of the nav bar, e.g. the step count. */
  trailing?: ReactNode;
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
  children,
  dock,
  testID,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root} testID={testID}>
      <NavBar leading={leading} onLeading={onBack} trailing={trailing} />
      <KeyboardAwareScrollView
        bottomOffset={96}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <Text variant="title" accessibilityRole="header">
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

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  content: {
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space['2xl'],
  },
  body: { marginTop: theme.space.sm },
  children: { marginTop: theme.space.xl, gap: theme.space.md },
  dock: {
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.sm,
    gap: theme.space.xs,
    backgroundColor: theme.colors.bg,
  },
  dockGap: { height: theme.space.md },
}));
