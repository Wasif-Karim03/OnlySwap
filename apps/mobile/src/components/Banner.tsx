import { useNetInfo } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, SlideInUp } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { banner as bannerCopy } from '@/strings';
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

/** How long the connection must stay down before the banner shows (flaps are common on Android). */
export const OFFLINE_SHOW_DELAY_MS = 1500;

/**
 * True once the device has been offline for OFFLINE_SHOW_DELAY_MS, false the
 * moment it is back. The one rule for the global banner and any screen line
 * that must appear and clear with it (Discover's queued-swipes line).
 */
export function useOfflineShown(): boolean {
  const net = useNetInfo();
  const offlineNow = isOffline(net);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    if (!offlineNow) return undefined;
    const t = setTimeout(() => setWaited(true), OFFLINE_SHOW_DELAY_MS);
    return () => {
      clearTimeout(t);
      setWaited(false);
    };
  }, [offlineNow]);

  return offlineNow && waited;
}

/**
 * Slides in from the top while the device is offline (fades with reduce
 * motion). It has an entering animation only: Reanimated exiting animations
 * keep a ghost view in the tree, and a banner that came back while its old
 * copy was still leaving crashed Android ("child already has a parent",
 * owner testing). It also waits OFFLINE_SHOW_DELAY_MS so short drops during
 * uploads don't flash it.
 */
export function OfflineBanner() {
  const reduced = useReducedMotion();
  const shown = useOfflineShown();
  if (!shown) return null;
  return (
    <Animated.View
      testID="offline-banner"
      entering={reduced ? FadeIn.duration(150) : SlideInUp.duration(220)}
      style={styles.top}
    >
      <Banner kind="offline" message={bannerCopy.offline} />
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  top: { position: 'absolute', top: rt.insets.top, left: theme.space.sm, right: theme.space.sm },
  banner: (kind: BannerKind) => ({
    // The offline bar is a compact 36 pt line; inline banners keep 44 pt.
    minHeight: kind === 'offline' ? theme.size.buttonS : theme.size.hit,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.md,
    paddingVertical: kind === 'offline' ? theme.space.xs : 0,
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
