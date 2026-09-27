import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { OTPInput } from '@/components/OTPInput';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { errorCopy, toAppError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { signIn as copy } from '@/strings/en';

import { authApi, type AuthApi } from './api';
import { AuthStep } from './AuthStep';
import { useGateHandoff } from './useAppGate';
import {
  formatCountdown,
  initialVerifyState,
  isExpired,
  isLocked,
  lockedFor,
  recordResend,
  recordWrong,
  resendIn,
  settle,
  triesLeft,
  verifyStore,
  type VerifyState,
} from './verifyLogic';

type Message = { tone: 'red' | 'ink2'; text: string } | null;

const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * S-A04 Verify code (P4-AUTH-06; boards A6, A9, X2). Autofill from Mail,
 * "n tries left" on a wrong code, a new code sent automatically when the old
 * one expired, and a 5-minute lockout after five wrong codes.
 */
export function VerifyScreen({
  api = authApi,
  now = Date.now,
}: {
  api?: AuthApi;
  now?: () => number;
}) {
  const router = useRouter();
  const handoff = useGateHandoff();
  // `mode=reverify`: the yearly student check (X9); the code renews it.
  const { email = '', mode } = useLocalSearchParams<{ email: string; mode?: string }>();
  const reverify = mode === 'reverify';
  const [state, setStateRaw] = useState<VerifyState>(
    () => verifyStore.get(email) ?? initialVerifyState(now()),
  );
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [wrongFlash, setWrongFlash] = useState(false);
  const [, setTick] = useState(0);
  const mounted = useRef(true);

  const setState = (s: VerifyState) => {
    verifyStore.set(email, s);
    setStateRaw(s);
  };

  // One tick a second drives the resend and lockout countdowns.
  useEffect(() => {
    mounted.current = true;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => {
      mounted.current = false;
      clearInterval(t);
    };
  }, []);

  const current = settle(state, now());
  const locked = isLocked(current, now());
  const resendSeconds = resendIn(current, now());

  const resend = async (reason: 'manual' | 'expired') => {
    setBusy(true);
    try {
      await api.sendCode(email);
      setState(recordResend(current, now()));
      setCode('');
      setWrongFlash(false);
      setMessage({ tone: 'ink2', text: reason === 'expired' ? copy.expired : copy.resent });
    } catch (e) {
      setMessage({ tone: 'red', text: errorCopy(toAppError(e), { campusTimeZone: deviceTz() }) });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const submit = async (value: string) => {
    if (busy || locked) return;
    if (isExpired(current, now())) {
      await resend('expired');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.verifyCode(email, value);
      verifyStore.clear(email);
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'ERR_OFFLINE' || err.code === 'RATE_LIMITED') {
        setMessage({ tone: 'red', text: errorCopy(err, { campusTimeZone: deviceTz() }) });
      } else {
        const next = recordWrong(current, now());
        setState(next);
        setWrongFlash(true);
        const left = triesLeft(next);
        setMessage({
          tone: 'red',
          text: isLocked(next, now())
            ? copy.locked.replace('{time}', formatCountdown(lockedFor(next, now())))
            : left === 1
              ? copy.wrongCodeOne
              : copy.wrongCode.replace('{count}', String(left)),
        });
      }
      if (mounted.current) setBusy(false);
      return;
    }
    if (reverify) {
      try {
        await api.completeReverify();
      } catch (e) {
        setMessage({ tone: 'red', text: errorCopy(toAppError(e), { campusTimeZone: deviceTz() }) });
        if (mounted.current) setBusy(false);
        return;
      }
    }
    haptic('success');
    // The launch gate decides the next step (age, profile, rules or the app).
    handoff();
  };

  const lockText = locked
    ? copy.locked.replace('{time}', formatCountdown(lockedFor(current, now())))
    : null;

  return (
    <AuthStep
      testID="screen-verify"
      title={copy.verifyTitle}
      body={copy.sentTo.replace('{email}', email)}
      dock={
        locked ? (
          <Button
            label={copy.resend}
            onPress={() => void resend('manual')}
            loading={busy}
            disabled={resendSeconds > 0}
            testID="verify-resend-main"
          />
        ) : null
      }
    >
      <OTPInput
        value={code}
        onChange={(v) => {
          setCode(v);
          if (wrongFlash) setWrongFlash(false);
        }}
        onComplete={(v) => void submit(v)}
        label={copy.codeLabel}
        error={wrongFlash}
        disabled={busy || locked}
        autoFocus
      />

      {lockText || message ? (
        <Text
          variant="meta"
          tone={lockText ? 'red' : (message?.tone ?? 'ink2')}
          accessibilityLiveRegion="polite"
          testID="verify-message"
        >
          {lockText ?? message?.text}
        </Text>
      ) : null}

      {!locked ? (
        resendSeconds > 0 ? (
          <Text variant="meta" tone="ink2" testID="verify-resend-timer">
            {copy.resendIn.replace('{time}', formatCountdown(resendSeconds))}
          </Text>
        ) : (
          <Tappable
            accessibilityRole="button"
            accessibilityLabel={copy.resend}
            onPress={() => void resend('manual')}
            disabled={busy}
            style={styles.link}
            testID="verify-resend"
          >
            <Text variant="label" style={styles.underline}>
              {copy.resend}
            </Text>
          </Tappable>
        )
      ) : null}

      <View>
        {!reverify ? (
          <Tappable
            accessibilityRole="button"
            accessibilityLabel={copy.differentEmail}
            onPress={() => router.back()}
            style={styles.link}
            testID="verify-different-email"
          >
            <Text variant="label" style={styles.underline}>
              {copy.differentEmail}
            </Text>
          </Tappable>
        ) : null}
        <Tappable
          accessibilityRole="link"
          accessibilityLabel={copy.cantAccessEmail}
          onPress={() => router.push('/help/email-access')}
          style={styles.link}
          testID="verify-cant-access"
        >
          <Text variant="label" style={styles.underline}>
            {copy.cantAccessEmail}
          </Text>
        </Tappable>
      </View>
    </AuthStep>
  );
}

const styles = StyleSheet.create((theme) => ({
  link: { minHeight: theme.size.hit, justifyContent: 'center', alignSelf: 'flex-start' },
  underline: { textDecorationLine: 'underline' },
}));
