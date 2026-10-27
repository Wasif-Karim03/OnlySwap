import { useRouter, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ErrorState } from '@/components/ErrorState';
import { Mark } from '@/components/Mark';
import { launch as copy } from '@/strings';

import { clearInviteCode } from './invite';
import { useLaunchIntro } from './LaunchIntro';
import { launchStartedAt, SPLASH_MARK } from './launchTiming';
import { GATE_HREF } from './logic';
import { takeListingLink } from './pendingLink';
import { useAppGate } from './useAppGate';

/**
 * Longest the launch waits for a route before it says so with Retry (owner
 * device check 2026-10-26: a stalled database left the logo up for good).
 */
export const LAUNCH_STALL_MS = 15_000;

const SIGNED_OUT_ROUTES = new Set<string>(['welcome', 'maintenance', 'update']);

/**
 * S-A01 Launch (P4-AUTH-03). The native splash stays up while the session
 * restores and the gate decides; this view matches it exactly (same
 * background, same mark, same size) so the handoff is invisible. Then it
 * replaces itself with the gate's route.
 */
export function LaunchScreen() {
  const router = useRouter();
  const gate = useAppGate();
  const routed = useRef(false);

  useEffect(() => {
    if (!gate.route || routed.current) return;
    routed.current = true;
    // Signed in (anything past Welcome and the system screens): an invite
    // link only opens the app, so a kept code is dropped (R11-INVITE-01).
    if (!SIGNED_OUT_ROUTES.has(gate.route)) clearInviteCode();
    // A listing link opened while signed out waits for sign-in (pendingLink.ts).
    const pending = gate.route === 'home' ? takeListingLink() : null;
    router.replace((pending ? `/listing/${pending}?from=link` : GATE_HREF[gate.route]) as Href);
    useLaunchIntro.getState().setReady();
    void SplashScreen.hideAsync().catch(() => {});
    if (__DEV__ && launchStartedAt.ms && process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console -- dev-only cold-start timing for P4-AUTH-03, stripped from release
      console.log(
        `[launch] first route "${gate.route}" after ${Math.round(performance.now() - launchStartedAt.ms)} ms`,
      );
    }
  }, [gate.route, router]);

  const qc = useQueryClient();
  const [stalled, setStalled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (gate.route || gate.failed) return undefined;
    const t = setTimeout(() => setStalled(true), LAUNCH_STALL_MS);
    return () => clearTimeout(t);
  }, [gate.route, gate.failed, attempt]);

  const failed = gate.failed || (stalled && !gate.route);
  useEffect(() => {
    if (!failed) return;
    useLaunchIntro.getState().setReady();
    void SplashScreen.hideAsync().catch(() => {});
  }, [failed]);

  if (failed) {
    const retry = async () => {
      setStalled(false);
      setAttempt((n) => n + 1);
      await Promise.all([
        qc.resetQueries({ queryKey: ['app_config'] }),
        qc.resetQueries({ queryKey: ['profile'] }),
      ]);
    };
    return (
      <View style={styles.root} testID="screen-launch-error">
        <ErrorState
          error={gate.failed ? gate.error : new Error('launch stalled')}
          onRetry={gate.failed ? gate.retry : retry}
        />
      </View>
    );
  }

  return (
    <View
      style={styles.root}
      testID="screen-launch"
      accessible
      accessibilityLabel={copy.label}
      accessibilityRole="progressbar"
    >
      <Mark size={SPLASH_MARK} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg,
  },
}));
