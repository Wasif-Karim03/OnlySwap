import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { Mark } from '@/components/Mark';
import { PermissionPrimerView } from '@/components/PermissionPrimer';
import { Text } from '@/components/Text';
import { osPermissions, usePermissionPrimer } from '@/lib/permissions';
import { getStorage } from '@/lib/storage';
import { notifyPrimer as copy, primer } from '@/strings';

import { useGateHandoff } from './useAppGate';

type OsApi = (typeof osPermissions)['notifications'];

function defaultMarkAsked(): void {
  getStorage().set('onboarding.notificationsAsked', true);
}

/**
 * A08 Notifications primer (P4-AUTH-10, board A12). Three example
 * notifications first; the OS prompt fires only from "Turn on notifications",
 * never on its own. Already granted skips straight on; denied for good offers
 * Settings. Either way the step is asked once (push token registration comes
 * with P9).
 */
export function NotificationsScreen({
  os = osPermissions.notifications,
  markAsked = defaultMarkAsked,
}: {
  os?: OsApi;
  markAsked?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const handoff = useGateHandoff();
  const { step, requesting, request, openSettings } = usePermissionPrimer('notifications', os);
  const done = useRef(false);

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    markAsked();
    handoff();
  }, [handoff, markAsked]);

  useEffect(() => {
    if (step === 'granted') finish();
  }, [step, finish]);

  if (step === null || step === 'granted') {
    return <View style={styles.screen} testID="screen-notifications-checking" />;
  }

  if (step === 'settings') {
    return (
      <PermissionPrimerView
        testID="screen-notifications-denied"
        kind="notifications"
        step="settings"
        onContinue={() => {}}
        onOpenSettings={() => void openSettings()}
        onAlternative={finish}
      />
    );
  }

  return (
    <View
      style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      testID="screen-notifications"
    >
      <ScrollView contentContainerStyle={styles.body}>
        <View
          style={styles.stack}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          {copy.samples.map((n) => (
            <View key={n.title} style={styles.note}>
              <Mark size={38} />
              <View style={styles.flex}>
                <View style={styles.noteHead}>
                  <Text variant="label" numberOfLines={1} style={styles.flex}>
                    {n.title}
                  </Text>
                  <Text variant="meta" tone="ink2">
                    {n.time}
                  </Text>
                </View>
                <Text variant="meta" tone="ink2" numberOfLines={2}>
                  {n.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <Text variant="title" accessibilityRole="header" style={styles.title}>
          {primer.notifications.title}
        </Text>
        <Text variant="body" tone="ink2">
          {primer.notifications.body}
        </Text>
      </ScrollView>
      <View style={styles.dock}>
        <Button
          label={copy.turnOn}
          loading={requesting}
          onPress={() =>
            void request()
              .catch(() => false)
              .finally(finish)
          }
          testID="notifications-turn-on"
        />
        <Button
          label={copy.notNow}
          variant="text"
          onPress={finish}
          testID="notifications-not-now"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  body: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.space.screen,
    gap: theme.space.sm,
  },
  stack: { gap: theme.space.sm },
  note: {
    flexDirection: 'row',
    gap: theme.space.md,
    alignItems: 'center',
    padding: theme.space.md,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.bg2,
  },
  noteHead: { flexDirection: 'row', alignItems: 'baseline', gap: theme.space.sm },
  flex: { flex: 1 },
  title: { marginTop: theme.space['2xl'] },
  dock: {
    paddingHorizontal: theme.space.screen,
    paddingBottom: theme.space.md,
    gap: theme.space.xs,
  },
}));
