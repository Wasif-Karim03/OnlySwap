import { useNetInfo } from '@react-native-community/netinfo';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { banner as bannerCopy } from '@/strings';
import { useReducedMotion } from '@/theme/reducedMotion';

import { Icon } from './icons/Icon';
import { Material } from './Material';
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

// The screen in front can say what offline means there ("swipes send when you're back").
let note: string | null = null;
const listeners = new Set<() => void>();
const noteStore = {
  set(next: string | null) {
    note = next;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => note,
};

/** While this screen is focused, the offline pill reads `text` instead of the default. */
export function useOfflineNote(text: string | null) {
  useFocusEffect(
    useCallback(() => {
      noteStore.set(text);
      return () => noteStore.set(null);
    }, [text]),
  );
}

/**
 * Round 2 (design/round2 consistency rules): one small pill, bottom center,
 * above the tab bar, on every page while the device is offline. It fades
 * or rises in (reduce motion fades), has no exit animation (Reanimated
 * exiting views crashed Android when the banner came straight back), and
 * waits OFFLINE_SHOW_DELAY_MS so short drops during uploads don't flash it.
 */
export function OfflineBanner() {
  const reduced = useReducedMotion();
  const shown = useOfflineShown();
  const text = useSyncExternalStore(noteStore.subscribe, noteStore.get, noteStore.get);
  if (!shown) return null;
  return (
    <Animated.View
      testID="offline-banner"
      entering={reduced ? FadeIn.duration(150) : SlideInDown.duration(220)}
      style={styles.bottom}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
    >
      <Material style={styles.pill}>
        <Text variant="label" numberOfLines={1}>
          {text ?? bannerCopy.offlinePill}
        </Text>
      </Material>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  // Above the floating tab bar (its height plus its gap), centered.
  bottom: {
    position: 'absolute',
    left: theme.space.lg,
    right: theme.space.lg,
    bottom: rt.insets.bottom + theme.size.hit + theme.space.xl + theme.space.md * 2,
    alignItems: 'center',
  },
  pill: {
    borderRadius: theme.radius.chip,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.sm,
  },
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
