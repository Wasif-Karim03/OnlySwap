import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as AgeRange from 'expo-age-range';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { GlyphTile } from '@/components/EmptyState';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { errorCopy, toAppError } from '@/lib/errors';
import { age as copy } from '@/strings/en';

import { requestAgeSignal, toIsoDate, type AgeRangeModule, type Device } from './age';
import { authApi, type AuthApi } from './api';
import { AuthStep } from './AuthStep';
import { useGateHandoff } from './useAppGate';

type Phase = 'checking' | 'form' | 'saving' | 'blocked';

const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function currentDevice(): Device {
  return {
    os: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'other',
    version: Platform.Version,
  };
}

/**
 * A05 Age check (P4-AUTH-07; boards A7 Birthday, A8 Not eligible; D4 native
 * date picker). The OS signal goes first; the date field is the fallback.
 * A minor's account is deleted right away (delete-account, underage mode)
 * and the email stays blocked (age_blocks), so there is no retry.
 */
export function AgeScreen({
  api = authApi,
  ageModule = AgeRange as unknown as AgeRangeModule,
  device = currentDevice(),
}: {
  api?: AuthApi;
  ageModule?: AgeRangeModule | null;
  device?: Device;
}) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  // Dev only: `/age?form=1` skips the OS signal so the date path can be tried
  // on a Simulator (which answers "18+" for everyone).
  const { form } = useLocalSearchParams<{ form?: string }>();
  const skipSignal = __DEV__ && form === '1';
  const [phase, setPhase] = useState<Phase>(skipSignal ? 'form' : 'checking');
  const [date, setDate] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(Platform.OS === 'ios');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const finishAdult = useGateHandoff();

  const finishMinor = async () => {
    // Delete first, then sign out; either failing still ends on the blocked
    // screen because the email is already in age_blocks.
    try {
      await api.deleteUnderageAccount();
    } catch {
      // The server keeps the age block; a later sign-up is refused anyway.
    }
    try {
      await api.signOut('local');
    } catch {
      // Nothing else to do; the session is gone with the account.
    }
    setPhase('blocked');
  };

  const submit = async (input: Parameters<AuthApi['confirmAge']>[0]) => {
    setPhase('saving');
    setError(null);
    try {
      const { adult } = await api.confirmAge(input);
      if (adult) finishAdult();
      else await finishMinor();
    } catch (e) {
      const err = toAppError(e);
      setError(
        err.code === 'INVALID' ? copy.invalidDate : errorCopy(err, { campusTimeZone: deviceTz() }),
      );
      setPhase('form');
    }
  };

  useEffect(() => {
    if (started.current || skipSignal) return;
    started.current = true;
    void requestAgeSignal(ageModule, device).then((signal) => {
      if (signal === 'unknown') setPhase('form');
      else void submit({ method: 'os_signal', isAdult: signal === 'adult' });
    });
    // Runs once on mount; the signal is asked a single time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'blocked') {
    return (
      <View
        style={[styles.blocked, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
        testID="screen-age-blocked"
      >
        <View style={styles.blockedBody}>
          <GlyphTile icon="lock" />
          <Text variant="heading" accessibilityRole="header" style={styles.center}>
            {copy.blockedTitle}
          </Text>
          <Text variant="body" tone="ink2" style={styles.center}>
            {copy.blockedBody}
          </Text>
          <View style={styles.card}>
            <Text variant="bodyStrong">{copy.blockedCardTitle}</Text>
            <Text variant="meta" tone="ink2">
              {copy.blockedCardBody}
            </Text>
          </View>
        </View>
        <View style={styles.blockedDock}>
          <Button
            label={copy.close}
            variant="secondary"
            onPress={() => router.replace('/welcome')}
            testID="age-close"
          />
        </View>
      </View>
    );
  }

  if (phase === 'checking') {
    return (
      <View
        style={styles.checking}
        testID="screen-age-checking"
        accessible
        accessibilityLabel={copy.checking}
      >
        <ActivityIndicator color={theme.colors.ink2} />
      </View>
    );
  }

  const maxDate = new Date();
  const onPick = (e: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS === 'android') setPickerOpen(false);
    if (e.type === 'set' && value) {
      setDate(value);
      setError(null);
    }
  };

  return (
    <AuthStep
      testID="screen-age"
      title={copy.title}
      body={copy.body}
      leading="none"
      trailing={
        <Text variant="meta" tone="ink2">
          {copy.step}
        </Text>
      }
      dock={
        <Button
          label={copy.continue}
          disabled={!date || phase === 'saving'}
          loading={phase === 'saving'}
          onPress={() =>
            date && void submit({ method: 'self_declared', birthDate: toIsoDate(date) })
          }
          testID="age-continue"
        />
      }
    >
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={copy.fieldLabel}
        accessibilityValue={{ text: date ? date.toLocaleDateString() : copy.fieldPlaceholder }}
        onPress={() => setPickerOpen(true)}
        testID="age-field"
      >
        <View style={styles.field(pickerOpen && Platform.OS === 'ios')}>
          <Text variant="label" tone="ink2">
            {copy.fieldLabel}
          </Text>
          <Text variant="body" tone={date ? 'ink' : 'ink3'}>
            {date
              ? date.toLocaleDateString(undefined, {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })
              : copy.fieldPlaceholder}
          </Text>
        </View>
      </Tappable>

      {pickerOpen ? (
        <DateTimePicker
          testID="age-picker"
          value={date ?? maxDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={maxDate}
          onChange={onPick}
          textColor={theme.colors.ink}
        />
      ) : null}

      {error ? (
        <Text variant="meta" tone="red" accessibilityLiveRegion="polite" testID="age-error">
          {error}
        </Text>
      ) : null}

      <Text variant="meta" tone="ink2">
        {copy.privacy}
      </Text>
    </AuthStep>
  );
}

const styles = StyleSheet.create((theme) => ({
  checking: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg,
  },
  field: (focused: boolean) => ({
    gap: theme.space.xs,
    padding: theme.space.lg,
    borderRadius: theme.radius.control,
    borderWidth: 2,
    borderColor: focused ? theme.colors.ink : 'transparent',
    backgroundColor: theme.colors.bg2,
  }),
  blocked: { flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: theme.space.screen },
  blockedBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space.md },
  center: { textAlign: 'center' },
  card: {
    alignSelf: 'stretch',
    gap: theme.space.xs,
    marginTop: theme.space.md,
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.card,
  },
  blockedDock: { paddingBottom: theme.space['2xl'] },
}));
