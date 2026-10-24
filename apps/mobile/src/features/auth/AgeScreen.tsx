import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as AgeRange from 'expo-age-range';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { WebDateInput } from '@/components/WebDateInput';
import { errorCopy, toAppError } from '@/lib/errors';
import { isWebPlatform } from '@/lib/platform';
import { age as copy } from '@/strings';

import {
  bandForSignal,
  checkRegulation,
  NOT_REGULATED,
  requestAgeAnswer,
  toIsoDate,
  type AgeDeclaration,
  type AgeRangeModule,
  type Device,
  type Regulation,
} from './age';
import { authApi, type AuthApi } from './api';
import { AuthStep } from './AuthStep';
import { useGateHandoff } from './useAppGate';

type Phase = 'checking' | 'form' | 'saving' | 'blocked' | 'osRequired';

const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function currentDevice(): Device {
  return {
    os: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'other',
    version: Platform.Version,
  };
}

/** Years back from today where the date wheels open (owner feedback, Android testing). */
export const PICKER_START_YEARS_AGO = 20;

/**
 * A05 Age check (P4-AUTH-07; boards A7 Birthday, A8 Not eligible; D4 native
 * date picker). The OS signal goes first; the date field is the fallback.
 * Under 13, the account is deleted right away (delete-account, underage mode)
 * and the email stays blocked (age_blocks), so there is no retry.
 * Where Apple says age assurance law applies (AR-03; Texas, Utah,
 * Louisiana), only the OS answer counts: no date field, and a declined
 * answer shows a retry instead.
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
  // Dev only: `/age?form=1` skips the OS signal so the date path can be tried
  // on a Simulator (which answers "18+" for everyone).
  const { form } = useLocalSearchParams<{ form?: string }>();
  const skipSignal = __DEV__ && form === '1';
  const [phase, setPhase] = useState<Phase>(skipSignal ? 'form' : 'checking');
  const [date, setDate] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(Platform.OS === 'ios');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const regulation = useRef<Regulation>(NOT_REGULATED);

  const finishEligible = useGateHandoff();

  const finishUnderMinimum = async () => {
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

  const submit = async (
    input: Parameters<AuthApi['confirmAge']>[0],
    declaration: AgeDeclaration | null = null,
  ) => {
    setPhase('saving');
    setError(null);
    try {
      const { eligible } = await api.confirmAge(input);
      if (!eligible) {
        await finishUnderMinimum();
        return;
      }
      if (regulation.current.required) {
        try {
          await api.recordAgeAssurance({ regulated: true, declaration });
        } catch {
          // The age is confirmed; a missed record doesn't stop sign-up.
        }
      }
      finishEligible();
    } catch (e) {
      const err = toAppError(e);
      setError(
        err.code === 'INVALID' ? copy.invalidDate : errorCopy(err, { campusTimeZone: deviceTz() }),
      );
      setPhase('form');
    }
  };

  const askOs = async () => {
    setPhase('checking');
    const { signal, declaration } = await requestAgeAnswer(ageModule, device);
    if (signal !== 'unknown') {
      void submit({ method: 'os_signal', band: bandForSignal(signal) }, declaration);
    } else {
      setPhase(regulation.current.required ? 'osRequired' : 'form');
    }
  };

  useEffect(() => {
    if (started.current || skipSignal) return;
    started.current = true;
    void (async () => {
      regulation.current = await checkRegulation(ageModule, device);
      await askOs();
    })();
    // Runs once on mount; the signal is asked a single time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'blocked') {
    // Left-aligned title and one line in a scrolling column, Close docked (3.01).
    return (
      <AuthStep
        testID="screen-age-blocked"
        title={copy.blockedTitle}
        body={copy.blockedBody}
        leading="none"
        dock={
          <Button
            label={copy.close}
            variant="secondary"
            onPress={() => router.replace('/welcome')}
            testID="age-close"
          />
        }
      />
    );
  }

  if (phase === 'osRequired') {
    return (
      <AuthStep
        testID="screen-age-os-required"
        title={copy.osRequiredTitle}
        body={copy.osRequiredBody}
        leading="none"
        step={3}
        dock={
          <>
            <Button
              label={copy.osRequiredRetry}
              onPress={() => void askOs()}
              testID="age-os-retry"
            />
            <Button
              label={copy.close}
              variant="text"
              onPress={() => router.replace('/welcome')}
              testID="age-os-close"
            />
          </>
        }
      >
        <Text variant="meta" tone="ink2">
          {copy.osRequiredHint}
        </Text>
      </AuthStep>
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
  // Where the wheels start before anything is picked: a typical student's
  // birth year, so nobody scrolls back from today. The field stays empty
  // until the person moves the wheels and confirms.
  const startDate = new Date(maxDate.getFullYear() - PICKER_START_YEARS_AGO, 0, 1);
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
      step={3}
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
      {isWebPlatform() ? (
        // Web app (P13-WEB-07): the browser's date field instead of the wheels.
        <View style={styles.webField}>
          <Text variant="label" tone="ink3">
            {copy.fieldLabel}
          </Text>
          <WebDateInput
            value={date}
            max={maxDate}
            label={copy.fieldLabel}
            onChange={(value) => {
              setDate(value);
              setError(null);
            }}
            testID="age-field-web"
          />
        </View>
      ) : (
        <Tappable
          accessibilityRole="button"
          accessibilityLabel={copy.fieldLabel}
          accessibilityValue={{ text: date ? date.toLocaleDateString() : copy.fieldPlaceholder }}
          onPress={() => setPickerOpen(true)}
          testID="age-field"
        >
          <View style={styles.field(pickerOpen && Platform.OS === 'ios')}>
            <Text variant="meta" tone="ink3" style={styles.fieldLabel}>
              {copy.fieldLabel}
            </Text>
            <Text variant="bodyStrong" tone={date ? 'ink' : 'ink3'}>
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
      )}

      {pickerOpen && !isWebPlatform() ? (
        <DateTimePicker
          testID="age-picker"
          value={date ?? startDate}
          mode="date"
          // Wheels on both platforms (Android's default is a month calendar,
          // which takes dozens of taps to reach a birth year).
          display="spinner"
          maximumDate={maxDate}
          onChange={onPick}
          textColor={theme.colors.ink}
          themeVariant={theme.mode}
        />
      ) : null}

      {error ? (
        <Text variant="meta" tone="red" accessibilityLiveRegion="polite" testID="age-error">
          {error}
        </Text>
      ) : null}

      <Text variant="meta" tone="ink3">
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
  webField: { gap: theme.space.xs },
  field: (focused: boolean) => ({
    gap: theme.space.xs,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.control,
    borderWidth: 2,
    borderColor: focused ? theme.colors.ink : 'transparent',
    backgroundColor: focused ? theme.colors.card : theme.colors.bg2,
  }),
  fieldLabel: { fontWeight: '600' },
}));
