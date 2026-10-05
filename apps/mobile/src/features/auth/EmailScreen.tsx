import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { track } from '@/lib/analytics';
import { Button } from '@/components/Button';
import { Icon } from '@/components/icons/Icon';
import { Input } from '@/components/Input';
import { Text } from '@/components/Text';
import { useToastStore } from '@/components/Toast';
import { errorCopy, toAppError } from '@/lib/errors';
import { signIn as copy } from '@/strings';

import { authApi, type AuthApi } from './api';
import { AuthStep } from './AuthStep';
import { sendCodeWithInvite } from './invite';
import { emailDomain, normalizeEmail } from './logic';
import { useSchoolLookup } from './useSchoolLookup';
import { setLoginIntent } from './loginIntent';
import { initialVerifyState, verifyStore } from './verifyLogic';

const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * S-A03 School email (P4-AUTH-05; boards A3, A4, A5 and the wrong-email
 * frame). Detects the school while typing, explains personal and unknown
 * addresses in one line, and shows a password only for listed reviewer
 * accounts (DEC 6).
 */
export function EmailScreen({ api = authApi }: { api?: AuthApi }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const lookup = useSchoolLookup(email, api);
  const showToast = useToastStore((s) => s.show);

  const school = lookup.kind === 'school' ? lookup.school : null;
  const reviewer = school?.isReview === true;

  const send = useMutation({
    mutationFn: async () => {
      const normalized = normalizeEmail(email) as string;
      if (reviewer) {
        await api.signInReviewer(normalized, password);
        return { normalized, reviewer: true };
      }
      // R11-INVITE-01: a code from an /i/ link credits the inviter on sign-up.
      await sendCodeWithInvite(api, normalized);
      setLoginIntent(params.mode === 'login');
      track('signup_started');
      return { normalized, reviewer: false };
    },
    onSuccess: ({ normalized, reviewer: isReviewer }) => {
      if (isReviewer) {
        router.replace('/');
        return;
      }
      verifyStore.set(normalized, {
        ...(verifyStore.get(normalized) ?? initialVerifyState(Date.now())),
        sentAt: Date.now(),
      });
      router.push({ pathname: '/verify', params: { email: normalized } });
    },
  });

  const waitlist = useMutation({
    mutationFn: () => api.joinWaitlist(email),
    onSuccess: () => showToast('success', copy.waitlistJoined),
    onError: (e) => showToast('error', errorCopy(toAppError(e), { campusTimeZone: deviceTz() })),
  });

  const sendError = send.error ? toAppError(send.error) : null;
  const sendErrorText = sendError
    ? reviewer && sendError.code === 'UNKNOWN'
      ? copy.wrongPassword
      : errorCopy(sendError, { campusTimeZone: deviceTz() })
    : undefined;

  const fieldError =
    lookup.kind === 'personal'
      ? copy.personal
      : lookup.kind === 'invalid'
        ? copy.invalid
        : undefined;

  const canSend = school !== null && (!reviewer || password.length > 0) && !send.isPending;
  const domain = emailDomain(email);

  return (
    <AuthStep
      testID="screen-email"
      title={params.mode === 'login' ? copy.titleSignIn : copy.titleSignUp}
      body={copy.body}
      dock={
        <Button
          label={reviewer ? copy.signInReviewer : copy.sendCode}
          onPress={() => send.mutate()}
          disabled={!canSend}
          loading={send.isPending}
          testID="email-send"
        />
      }
    >
      <Input
        label={copy.emailLabel}
        hideLabel
        kind="email"
        placeholder={copy.emailPlaceholder}
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          if (send.error) send.reset();
        }}
        error={fieldError}
        loading={lookup.kind === 'checking'}
        returnKeyType="send"
        onSubmitEditing={() => canSend && send.mutate()}
        autoFocus
        testID="email-input"
      />

      {school ? (
        <View style={styles.detected} testID="email-school" accessible accessibilityRole="text">
          <Icon name="building" size={18} />
          <Text variant="bodyStrong" style={styles.flex}>
            {reviewer ? copy.reviewAccount.replace('{school}', school.name) : school.name}
          </Text>
          <Icon name="check" size={18} tone="green" />
        </View>
      ) : null}

      {reviewer ? (
        <Input
          label={copy.passwordLabel}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          autoComplete="password"
          returnKeyType="go"
          onSubmitEditing={() => canSend && send.mutate()}
          testID="email-password"
        />
      ) : null}

      {lookup.kind === 'unknown' && domain ? (
        <View style={styles.card} testID="email-unknown">
          <Text variant="bodyStrong">{copy.unknownTitle.replace('{domain}', domain)}</Text>
          <Text variant="meta" tone="ink2">
            {copy.unknownBody}
          </Text>
          <Button
            label={copy.joinWaitlist}
            variant="secondary"
            size="M"
            loading={waitlist.isPending}
            onPress={() => waitlist.mutate()}
            testID="email-waitlist"
          />
        </View>
      ) : null}

      {lookup.kind === 'personal' || lookup.kind === 'unknown' ? (
        <View style={styles.card} testID="email-alumni">
          <Text variant="bodyStrong">{copy.alumniTitle}</Text>
          <Text variant="meta" tone="ink2">
            {copy.alumniBody}
          </Text>
        </View>
      ) : null}

      {lookup.kind === 'error' ? (
        <Text
          variant="meta"
          tone="red"
          accessibilityLiveRegion="polite"
          testID="email-lookup-error"
        >
          {errorCopy(toAppError(lookup.error), { campusTimeZone: deviceTz() })}
        </Text>
      ) : null}

      {sendErrorText ? (
        <Text variant="meta" tone="red" accessibilityLiveRegion="polite" testID="email-send-error">
          {sendErrorText}
        </Text>
      ) : null}
    </AuthStep>
  );
}

const styles = StyleSheet.create((theme) => ({
  flex: { flex: 1 },
  detected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    minHeight: theme.size.hit,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.greenBg,
  },
  card: {
    gap: theme.space.xs,
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.card,
  },
}));
