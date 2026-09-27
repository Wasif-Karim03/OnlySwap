import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { GlyphTile } from '@/components/EmptyState';
import { Input } from '@/components/Input';
import { Text } from '@/components/Text';
import { TextArea } from '@/components/TextArea';
import { authApi, type AuthApi } from '@/features/auth/api';
import { AuthStep } from '@/features/auth/AuthStep';
import { normalizeEmail } from '@/features/auth/logic';
import { errorCopy, toAppError } from '@/lib/errors';
import { emailAccess as copy } from '@/strings/en';

const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const MAX_BODY = 2000;

/** The message the owner reads: the old school address first, then the story. */
export function composeMessage(schoolEmail: string, message: string): string {
  const school = schoolEmail.trim();
  const text = message.trim();
  return (school ? `School email on the account: ${school}\n\n${text}` : text).slice(0, MAX_BODY);
}

/**
 * F20 "I can't get into my school email" (P4-AUTH-19, D11, PM-03). Works
 * signed out. The owner checks who they are by hand and moves the account to
 * a new school address (admin_change_email).
 */
export function EmailAccessScreen({ api = authApi }: { api?: AuthApi }) {
  const router = useRouter();
  const [contact, setContact] = useState('');
  const [school, setSchool] = useState('');
  const [message, setMessage] = useState('');
  const [contactError, setContactError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async () => {
    const email = normalizeEmail(contact);
    if (!email) {
      setContactError(copy.contactInvalid);
      return;
    }
    if (!message.trim()) {
      setError(copy.messageEmpty);
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api.sendSupportRequest({
        email,
        topic: 'cant_access_email',
        body: composeMessage(school, message),
      });
      setSentTo(email);
    } catch (e) {
      setError(errorCopy(toAppError(e), { campusTimeZone: deviceTz() }));
    } finally {
      setSending(false);
    }
  };

  if (sentTo) {
    return (
      <AuthStep
        testID="screen-email-access-sent"
        title={copy.sentTitle}
        body={copy.sentBody.replace('{email}', sentTo)}
        onBack={() => router.back()}
        dock={<Button label={copy.done} onPress={() => router.back()} testID="email-access-done" />}
      >
        <GlyphTile icon="mail" tile="accent" />
      </AuthStep>
    );
  }

  return (
    <AuthStep
      testID="screen-email-access"
      title={copy.title}
      body={copy.body}
      onBack={() => router.back()}
      dock={
        <Button
          label={copy.send}
          onPress={() => void submit()}
          loading={sending}
          disabled={sending}
          testID="email-access-send"
        />
      }
    >
      <Input
        label={copy.contactLabel}
        kind="email"
        value={contact}
        onChangeText={(v) => {
          setContact(v);
          if (contactError) setContactError(null);
        }}
        error={contactError ?? undefined}
        placeholder={copy.contactPlaceholder}
        testID="email-access-contact"
      />
      <Input
        label={copy.schoolLabel}
        kind="email"
        value={school}
        onChangeText={setSchool}
        placeholder={copy.schoolPlaceholder}
        testID="email-access-school"
      />
      <TextArea
        label={copy.messageLabel}
        value={message}
        onChangeText={(v) => {
          setMessage(v);
          if (error) setError(null);
        }}
        maxLength={1800}
        placeholder={copy.messagePlaceholder}
        testID="email-access-message"
      />
      <View style={styles.note}>
        <Text variant="meta" tone="ink2">
          {copy.note}
        </Text>
      </View>
      {error ? (
        <Text
          variant="meta"
          tone="red"
          accessibilityLiveRegion="polite"
          testID="email-access-error"
        >
          {error}
        </Text>
      ) : null}
    </AuthStep>
  );
}

const styles = StyleSheet.create((theme) => ({
  note: { marginTop: theme.space.xs },
}));
