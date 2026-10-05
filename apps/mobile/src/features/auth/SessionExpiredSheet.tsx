import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { OTPInput } from '@/components/OTPInput';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { errorCopy, toAppError } from '@/lib/errors';
import { sessionExpired as copy, signIn } from '@/strings';

import { authApi, type AuthApi } from './api';
import { noteIntentionalSignOut, useSessionExpiry } from './sessionExpiry';

const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * X7 Session expired (P4-AUTH-14, board X7): a sheet over wherever the person
 * was. A code goes to their school email as it opens; entering it signs them
 * back in on the same screen. "Log out instead" goes to Welcome.
 */
export function SessionExpiredSheet({ api = authApi }: { api?: AuthApi }) {
  const router = useRouter();
  const { open, email, hide } = useSessionExpiry();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);
  const sentFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !email || sentFor.current === email) return;
    sentFor.current = email;
    setCode('');
    setMessage(null);
    api.sendCode(email).catch((e: unknown) => {
      setMessage(errorCopy(toAppError(e), { campusTimeZone: deviceTz() }));
    });
  }, [open, email, api]);

  const close = () => {
    sentFor.current = null;
    hide();
  };

  const submit = async (value: string) => {
    if (!email || busy || value.length !== 6) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.verifyCode(email, value);
      close();
    } catch (e) {
      const err = toAppError(e);
      setWrong(err.code !== 'ERR_OFFLINE' && err.code !== 'RATE_LIMITED');
      setMessage(
        err.code === 'ERR_OFFLINE' || err.code === 'RATE_LIMITED'
          ? errorCopy(err, { campusTimeZone: deviceTz() })
          : copy.wrongCode,
      );
    } finally {
      setBusy(false);
    }
  };

  const logOut = async () => {
    noteIntentionalSignOut();
    try {
      await api.signOut('local');
    } catch {
      // The session is already gone; nothing else to clean up.
    }
    close();
    router.replace('/welcome');
  };

  return (
    <Sheet
      visible={open}
      onClose={() => void logOut()}
      title={copy.title}
      testID="sheet-session-expired"
    >
      <View style={styles.body}>
        <Text variant="body" tone="ink2">
          {copy.body.replace('{email}', email ?? '')}
        </Text>
        <OTPInput
          value={code}
          onChange={(v) => {
            setCode(v);
            if (wrong) setWrong(false);
          }}
          onComplete={(v) => void submit(v)}
          label={signIn.codeLabel}
          error={wrong}
          disabled={busy}
          autoFocus
        />
        {message ? (
          <Text
            variant="meta"
            tone="red"
            accessibilityLiveRegion="polite"
            testID="session-expired-message"
          >
            {message}
          </Text>
        ) : null}
        <Button
          label={copy.continue}
          onPress={() => void submit(code)}
          disabled={code.length !== 6 || busy}
          loading={busy}
          testID="session-expired-continue"
        />
        <Button
          label={copy.logOut}
          variant="text"
          onPress={() => void logOut()}
          testID="session-expired-logout"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: { gap: theme.space.md },
}));
