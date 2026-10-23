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
import { useTurnstile, type TurnstileSeam } from '@/components/TurnstileField';
import { errorCopy, toAppError } from '@/lib/errors';
import { isTurnstileError } from '@/lib/turnstile';
import { banner, signIn as copy } from '@/strings';

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
export function EmailScreen({
  api = authApi,
  turnstileField,
}: {
  api?: AuthApi;
  /** Test seam for the web bot check on the waitlist card (LR-04). */
  turnstileField?: TurnstileSeam;
}) {
  const router = useRouter();
  const bot = useTurnstile(turnstileField);
  const params = useLocalSearchParams<{ mode?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const lookup = useSchoolLookup(email, api);
  const showToast = useToastStore((s) => s.show);

  const school = lookup.kind === 'school' ? lookup.school : null;
  const reviewer = school?.isReview === true;

  const login = params.mode === 'login';
  const [noAccountFor, setNoAccountFor] = useState<string | null>(null);

  const goToVerify = (normalized: string) => {
    verifyStore.set(normalized, {
      ...(verifyStore.get(normalized) ?? initialVerifyState(Date.now())),
      sentAt: Date.now(),
    });
    router.push({ pathname: '/verify', params: { email: normalized } });
  };

  const send = useMutation({
    mutationFn: async () => {
      const normalized = normalizeEmail(email) as string;
      if (reviewer) {
        await api.signInReviewer(normalized, password);
        return { normalized, outcome: 'reviewer' as const };
      }
      // DEC 140: "I already have an account" never creates one.
      if (login) {
        const result = await api.signInCode(normalized);
        if (result === 'no_account') return { normalized, outcome: 'no_account' as const };
        setLoginIntent(true);
        return { normalized, outcome: 'sent' as const };
      }
      // R11-INVITE-01: a code from an /i/ link credits the inviter on sign-up.
      await sendCodeWithInvite(api, normalized);
      setLoginIntent(false);
      track('signup_started');
      return { normalized, outcome: 'sent' as const };
    },
    onSuccess: ({ normalized, outcome }) => {
      if (outcome === 'reviewer') {
        router.replace('/');
        return;
      }
      if (outcome === 'no_account') {
        setNoAccountFor(normalized);
        return;
      }
      goToVerify(normalized);
    },
  });

  /** "Create an account" after login mode found none: the sign-up code, same email. */
  const createAccount = useMutation({
    mutationFn: async () => {
      const normalized = normalizeEmail(email) as string;
      await sendCodeWithInvite(api, normalized);
      setLoginIntent(false);
      track('signup_started');
      return normalized;
    },
    onSuccess: (normalized) => {
      setNoAccountFor(null);
      goToVerify(normalized);
    },
  });

  const waitlist = useMutation({
    mutationFn: () => (bot.token ? api.joinWaitlist(email, bot.token) : api.joinWaitlist(email)),
    onSuccess: () => showToast('success', copy.waitlistJoined),
    onError: (e) =>
      showToast(
        'error',
        isTurnstileError(e)
          ? banner.botCheckFailed
          : errorCopy(toAppError(e), { campusTimeZone: deviceTz() }),
      ),
    // Tokens are single use: a fresh check for the next try.
    onSettled: () => bot.reset(),
  });

  const failed = send.error ?? createAccount.error;
  const sendError = failed ? toAppError(failed) : null;
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

  const canSend =
    school !== null &&
    (!reviewer || password.length > 0) &&
    !send.isPending &&
    !createAccount.isPending;
  const domain = emailDomain(email);

  return (
    <AuthStep
      testID="screen-email"
      title={login ? copy.titleSignIn : copy.titleSignUp}
      body={copy.body}
      step={login ? undefined : 1}
      dock={
        // One docked action that follows the state (3.01): login with no
        // account offers "Create an account" in place of "Send code".
        noAccountFor ? (
          // Own key: a fresh button, so the double-tap guard of Send doesn't carry over.
          <Button
            key="create-account"
            label={copy.createAccount}
            loading={createAccount.isPending}
            onPress={() => createAccount.mutate()}
            testID="email-create-account"
          />
        ) : (
          <Button
            key="send"
            label={reviewer ? copy.signInReviewer : copy.sendCode}
            onPress={() => send.mutate()}
            disabled={!canSend}
            loading={send.isPending}
            testID="email-send"
          />
        )
      }
    >
      <Input
        label={copy.emailLabel}
        inlineLabel
        kind="email"
        placeholder={copy.emailPlaceholder}
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          if (send.error) send.reset();
          if (createAccount.error) createAccount.reset();
          setNoAccountFor(null);
        }}
        error={fieldError}
        loading={lookup.kind === 'checking'}
        returnKeyType="send"
        onSubmitEditing={() => canSend && send.mutate()}
        autoFocus
        testID="email-input"
      />

      {school ? (
        // The matched school as one plain line with a green check (DEC 90).
        <View style={styles.detected} testID="email-school" accessible accessibilityRole="text">
          <Icon name="check" size={16} tone="green" strokeWidth={2.4} />
          <Text variant="label" style={styles.flex}>
            {reviewer ? copy.reviewAccount.replace('{school}', school.name) : school.name}
          </Text>
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
          {/* The alumni line folds into this card instead of a second card. */}
          <Text variant="meta" tone="ink2">
            {copy.alumniBody}
          </Text>
          {bot.element}
          <Button
            label={copy.joinWaitlist}
            variant="secondary"
            size="M"
            loading={waitlist.isPending}
            disabled={bot.required && !bot.token}
            onPress={() => waitlist.mutate()}
            testID="email-waitlist"
          />
        </View>
      ) : null}

      {lookup.kind === 'personal' ? (
        // Plain lines under the field error, no second card (3.01).
        <View style={styles.plain} testID="email-alumni">
          <Text variant="label">{copy.alumniTitle}</Text>
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

      {noAccountFor ? (
        // Plain text; "Create an account" is the docked action now.
        <View style={styles.plain} testID="email-no-account" accessibilityLiveRegion="polite">
          <Text variant="label">{copy.noAccountTitle.replace('{email}', noAccountFor)}</Text>
          <Text variant="meta" tone="ink2">
            {copy.noAccountBody}
          </Text>
        </View>
      ) : null}

      {sendErrorText ? (
        <Text variant="meta" tone="red" accessibilityLiveRegion="polite" testID="email-send-error">
          {sendErrorText}
        </Text>
      ) : null}

      <Text variant="meta" tone="ink3" testID="email-legal">
        {copy.legal}
      </Text>
    </AuthStep>
  );
}

const styles = StyleSheet.create((theme) => ({
  flex: { flex: 1 },
  detected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
    marginTop: -theme.space.xs,
    paddingHorizontal: theme.space.xs,
  },
  plain: { gap: theme.space.xs, paddingHorizontal: theme.space.xs },
  card: {
    gap: theme.space.xs,
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.card,
  },
}));
