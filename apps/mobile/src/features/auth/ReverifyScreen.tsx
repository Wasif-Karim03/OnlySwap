import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { GlyphTile } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { GroupedList, ListRow } from '@/components/ListRow';
import { Text } from '@/components/Text';
import { errorCopy, toAppError } from '@/lib/errors';
import { reverify as copy, states, intlLocale } from '@/strings';

import { authApi, type AuthApi } from './api';
import { AuthStep } from './AuthStep';

const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** "Aug 31, 2027" from YYYY-MM-DD, read as a calendar date (no time zone shift). */
export function formatDueDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(intlLocale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * X9 Re-verify (P4-AUTH-14, board X9). Once a year the student check is
 * renewed with a code sent to the school email; the Verify screen in
 * `mode=reverify` finishes it with complete_reverify.
 */
export function ReverifyScreen({ api = authApi }: { api?: AuthApi }) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const account = useQuery({
    queryKey: ['account', 'reverify'],
    queryFn: async () => {
      const acct = await api.getAccountEmail();
      if (!acct) return null;
      const school = await api.lookupSchool(acct.email).catch(() => null);
      return { ...acct, school: school?.kind === 'school' ? school.school.shortName : null };
    },
  });

  if (account.isError && !account.data) {
    return (
      <View style={styles.full} testID="screen-reverify-error">
        <ErrorState error={account.error} onRetry={() => account.refetch()} />
      </View>
    );
  }
  if (account.data === undefined) {
    return (
      <View
        style={styles.full}
        testID="screen-reverify-loading"
        accessible
        accessibilityLabel={states.loading}
      >
        <ActivityIndicator color={theme.colors.ink2} />
      </View>
    );
  }
  const data = account.data;

  const send = async () => {
    if (!data) return;
    setSending(true);
    setError(null);
    try {
      await api.sendCode(data.email);
      router.push({ pathname: '/verify', params: { email: data.email, mode: 'reverify' } });
    } catch (e) {
      setError(errorCopy(toAppError(e), { campusTimeZone: deviceTz() }));
    } finally {
      setSending(false);
    }
  };

  const logOut = async () => {
    try {
      await api.signOut('local');
    } finally {
      router.replace('/welcome');
    }
  };

  return (
    <AuthStep
      testID="screen-reverify"
      leading="none"
      title={data?.school ? copy.title.replace('{school}', data.school) : copy.titleNoSchool}
      body={copy.body}
      dock={
        <>
          <Button
            label={copy.sendCode}
            onPress={() => void send()}
            loading={sending}
            disabled={!data || sending}
            testID="reverify-send"
          />
          <Button
            label={copy.logOut}
            variant="text"
            onPress={() => void logOut()}
            testID="reverify-logout"
          />
        </>
      }
    >
      <GlyphTile icon="shield" />
      {data ? (
        <GroupedList>
          <ListRow label={copy.emailLabel} value={data.email} />
          {data.verifiedUntil ? (
            <ListRow label={copy.dueLabel} value={formatDueDate(data.verifiedUntil)} />
          ) : null}
        </GroupedList>
      ) : null}
      {error ? (
        <Text variant="meta" tone="red" accessibilityLiveRegion="polite" testID="reverify-error">
          {error}
        </Text>
      ) : null}
      <Text variant="meta" tone="ink2">
        {copy.graduated}
      </Text>
    </AuthStep>
  );
}

const styles = StyleSheet.create((theme) => ({
  full: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg,
  },
}));
