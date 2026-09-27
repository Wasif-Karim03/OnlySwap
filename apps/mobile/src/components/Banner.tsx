import { useNetInfo } from '@react-native-community/netinfo';
import { View } from 'react-native';
import Animated, { SlideInUp, SlideOutUp, FadeIn, FadeOut } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { banner as bannerCopy } from '@/strings/en';
import { useReducedMotion } from '@/theme/reducedMotion';

import { Icon } from './icons/Icon';
import { Text } from './Text';

export type BannerKind = 'offline' | 'info' | 'warning' | 'error';

const ICON = { offline: 'wifi', info: 'info', warning: 'alert', error: 'alert' } as const;
const TONE = { offline: 'ink', info: 'ink', warning: 'amber', error: 'red' } as const;

export function Banner({ kind, message }: { kind: BannerKind; message: string }) {
  return (
    <View style={styles.banner(kind)} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Icon name={ICON[kind]} size={18} tone={TONE[kind]} />
      <Text variant="label" style={styles.text}>
        {message}
      </Text>
    </View>
  );
}

/** Online means connected and not known to be unreachable. */
export function isOffline(state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}

/** Slides in from the top while the device is offline (fades with reduce motion). */
export function OfflineBanner() {
  const net = useNetInfo();
  const reduced = useReducedMotion();
  if (!isOffline(net)) return null;
  return (
    <Animated.View
      testID="offline-banner"
      entering={reduced ? FadeIn.duration(150) : SlideInUp.duration(220)}
      exiting={reduced ? FadeOut.duration(150) : SlideOutUp.duration(220)}
      style={styles.top}
    >
      <Banner kind="offline" message={bannerCopy.offline} />
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  top: { position: 'absolute', top: rt.insets.top, left: theme.space.sm, right: theme.space.sm },
  banner: (kind: BannerKind) => ({
    minHeight: theme.size.hit,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.control,
    backgroundColor:
      kind === 'warning'
        ? theme.colors.amberBg
        : kind === 'error'
          ? theme.colors.redBg
          : theme.colors.bg2,
  }),
  text: { flex: 1 },
}));
