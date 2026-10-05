import type { ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { nav as navCopy } from '@/strings';

import { IconButton } from './IconButton';
import { Text } from './Text';

export type NavBarProps = {
  title?: string;
  /**
   * `large`: tab roots, big left-aligned title (UX-04).
   * `inline`: pushed screens and sheets, small title next to back or close.
   */
  variant?: 'large' | 'inline';
  leading?: 'back' | 'close' | 'none';
  onLeading?: () => void;
  /** Right side: IconButtons, a step count ("1 of 3") or a text Button. */
  trailing?: ReactNode;
  /** Adds the status bar inset. Off when the screen already pads for it. */
  safeTop?: boolean;
  /** `onPhoto` over photos or in the dark photo viewer (board B10). */
  tone?: 'default' | 'onPhoto';
  testID?: string;
};

/**
 * Screen header (P2-CMP-09). iOS centers the inline title; Android puts it
 * next to the back arrow, as Material does. The system back gesture still
 * works on both; the on-screen button is for people who don't use it.
 */
export function NavBar({
  title,
  variant = 'inline',
  leading = variant === 'inline' ? 'back' : 'none',
  onLeading,
  trailing,
  safeTop = true,
  tone = 'default',
  testID,
}: NavBarProps) {
  const textTone = tone === 'onPhoto' ? 'onPhoto' : 'ink';
  const centered = Platform.OS === 'ios';

  if (variant === 'large') {
    return (
      <View testID={testID} style={styles.large(safeTop)}>
        <Text variant="title" accessibilityRole="header" style={styles.flex}>
          {title}
        </Text>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
    );
  }

  return (
    <View testID={testID} style={styles.inline(safeTop)}>
      <View style={styles.side}>
        {leading !== 'none' ? (
          <IconButton
            icon={leading === 'back' ? 'back' : 'x'}
            accessibilityLabel={leading === 'back' ? navCopy.back : navCopy.close}
            onPress={onLeading}
            tone={textTone}
          />
        ) : null}
      </View>
      <View style={styles.titleWrap} pointerEvents="none">
        {title ? (
          <Text
            variant="bodyStrong"
            tone={textTone}
            accessibilityRole="header"
            numberOfLines={2}
            style={centered ? styles.center : undefined}
          >
            {title}
          </Text>
        ) : null}
      </View>
      <View style={[styles.side, styles.end]}>{trailing}</View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  flex: { flex: 1 },
  large: (safeTop: boolean) => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingTop: (safeTop ? rt.insets.top : 0) + theme.space.sm,
    paddingBottom: theme.space.sm,
    paddingHorizontal: theme.space.screen,
    minHeight: theme.size.navBar + theme.space.lg,
  }),
  trailing: { flexDirection: 'row', alignItems: 'center', gap: theme.space.xs },
  inline: (safeTop: boolean) => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
    paddingTop: safeTop ? rt.insets.top : 0,
    paddingHorizontal: theme.space.sm,
    minHeight: theme.size.navBar + (safeTop ? rt.insets.top : 0),
  }),
  side: {
    minWidth: theme.size.hit,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  end: { justifyContent: 'flex-end', paddingRight: theme.space.xs },
  titleWrap: { flex: 1, paddingVertical: theme.space.xs },
  center: { textAlign: 'center' },
}));
