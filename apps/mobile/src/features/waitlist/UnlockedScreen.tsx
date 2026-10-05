import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { Mark } from '@/components/Mark';
import { SuccessCheck } from '@/components/SuccessCheck';
import { Text } from '@/components/Text';
import { fill } from '@/lib/format';
import { unlocked as copy } from '@/strings';
import { animateTo, resolveMotion } from '@/theme/motion';
import { useReducedMotion } from '@/theme/reducedMotion';

import { waitlistApi, waitlistKey, type WaitlistApi } from './api';

/** How long the confetti burst runs (A14). */
export const CONFETTI_MS = 1200;
const PIECES = 18;

/**
 * A10 Campus open (P4-AUTH-13; board A14). Shown once: on the first launch
 * after your campus opens (the gate reads show_unlocked) or from the
 * campus_unlocked push. Marks it seen right away (mark_unlock_seen). A short
 * confetti burst; with reduce motion the screen just fades in.
 */
export function UnlockedScreen({ api = waitlistApi }: { api?: WaitlistApi }) {
  const router = useRouter();
  const qc = useQueryClient();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const info = useQuery({ queryKey: waitlistKey, queryFn: api.position });
  const marked = useRef(false);
  const fade = useSharedValue(reduced ? 0 : 1);

  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    api
      .markUnlockSeen()
      .then(() => {
        // The launch gate re-reads the profile, so A10 never shows twice.
        qc.removeQueries({ queryKey: ['profile'] });
        void qc.invalidateQueries({ queryKey: waitlistKey });
      })
      .catch(() => {});
  }, [api, qc]);

  useEffect(() => {
    if (reduced) fade.set(animateTo(1, resolveMotion('fade', true)));
    else fade.set(1);
  }, [reduced, fade]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const campus = info.data?.campus?.short_name ?? null;
  const threshold = info.data?.threshold ?? 0;

  return (
    <View
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      testID="screen-unlocked"
    >
      {reduced ? null : <Confetti />}
      <Animated.View style={[styles.content, fadeStyle]}>
        <SuccessCheck visible accessibilityLabel={copy.label} />
        <Text variant="display" accessibilityRole="header">
          {copy.title}
        </Text>
        <Text variant="body" tone="ink2">
          {campus && threshold > 0 ? fill(copy.body, { campus, threshold }) : copy.bodyNoCampus}
        </Text>
        <View style={styles.founding}>
          <Mark size={40} />
          <View style={styles.flex}>
            <Text variant="bodyStrong">{copy.foundingTitle}</Text>
            <Text variant="meta" tone="ink2">
              {copy.foundingBody}
            </Text>
          </View>
        </View>
      </Animated.View>
      <View style={styles.dock}>
        <Button label={copy.list} onPress={() => router.replace('/sell')} testID="unlocked-list" />
        <Button
          label={copy.start}
          variant="secondary"
          onPress={() => router.replace('/discover')}
          testID="unlocked-start"
        />
      </View>
    </View>
  );
}

/** A one-off burst from the top centre. Decorative: hidden from screen readers. */
function Confetti() {
  return (
    <View
      style={styles.confetti}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="unlocked-confetti"
    >
      {Array.from({ length: PIECES }, (_, i) => (
        <Piece key={i} i={i} />
      ))}
    </View>
  );
}

function Piece({ i }: { i: number }) {
  const { theme } = useUnistyles();
  const colors = [theme.colors.accent, theme.colors.ink, theme.colors.green, theme.colors.amber];
  const p = useSharedValue(0);
  // Spread the pieces over a downward fan, each a little different.
  const angle = Math.PI * (0.1 + (0.8 * i) / (PIECES - 1));
  const dist = 140 + (i % 4) * 40;
  const dx = Math.cos(angle) * dist;
  const dy = Math.sin(angle) * dist + 80;

  useEffect(() => {
    p.set(
      withDelay(
        (i % 6) * 40,
        withTiming(1, {
          duration: CONFETTI_MS,
          easing: Easing.out(Easing.quad),
          reduceMotion: ReduceMotion.Never,
        }),
      ),
    );
  }, [p, i]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - p.value,
    transform: [
      { translateX: dx * p.value },
      { translateY: dy * p.value },
      { rotate: `${p.value * (i % 2 ? 300 : -300)}deg` },
    ],
  }));

  return <Animated.View style={[styles.piece(colors[i % colors.length] as string), style]} />;
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  content: {
    flex: 1,
    gap: theme.space.lg,
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space['2xl'] * 2,
  },
  flex: { flex: 1, gap: theme.space.xs },
  founding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.bg2,
  },
  dock: {
    gap: theme.space.sm,
    paddingHorizontal: theme.space.screen,
    paddingBottom: theme.space.lg,
  },
  confetti: {
    position: 'absolute',
    top: theme.space['2xl'],
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  piece: (color: string) => ({
    position: 'absolute',
    width: theme.space.sm,
    height: theme.space.md,
    borderRadius: theme.space.xs / 2,
    backgroundColor: color,
  }),
}));
