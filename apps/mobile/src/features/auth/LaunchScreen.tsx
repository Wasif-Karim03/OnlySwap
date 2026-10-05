import { useRouter, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ErrorState } from '@/components/ErrorState';
import { Mark } from '@/components/Mark';
import { launch as copy } from '@/strings/en';

import { clearInviteCode } from './invite';
import { launchStartedAt } from './launchTiming';
import { GATE_HREF } from './logic';
import { useAppGate } from './useAppGate';

const SIGNED_OUT_ROUTES = new Set<string>(['welcome', 'maintenance', 'update']);

/** Native splash icon width (app.config.ts `imageWidth`), so the handoff doesn't jump. */
const SPLASH_MARK = 88;

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
    router.replace(GATE_HREF[gate.route] as Href);
    void SplashScreen.hideAsync().catch(() => {});
    if (__DEV__ && launchStartedAt.ms && process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console -- dev-only cold-start timing for P4-AUTH-03, stripped from release
      console.log(
        `[launch] first route "${gate.route}" after ${Math.round(performance.now() - launchStartedAt.ms)} ms`,
      );
    }
  }, [gate.route, router]);

  useEffect(() => {
    if (gate.failed) void SplashScreen.hideAsync().catch(() => {});
  }, [gate.failed]);

  if (gate.failed) {
    return (
      <View style={styles.root} testID="screen-launch-error">
        <ErrorState error={gate.error} onRetry={gate.retry} />
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
