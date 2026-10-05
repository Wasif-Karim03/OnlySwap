import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Avatar } from '@/components/Avatar';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Input } from '@/components/Input';
import { NavBar } from '@/components/NavBar';
import { Sheet } from '@/components/Sheet';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { TextArea } from '@/components/TextArea';
import { getEnv } from '@/lib/env';
import { errorText } from '@/lib/errors';
import { fill } from '@/lib/format';
import { safety as copy, intlLocale } from '@/strings';

import { authApi, type AuthApi } from '../auth/api';
import { useSession } from '../auth/useSession';
import { mediaUrl } from '../sell/logic';
import { appealTarget, safetyApi, type SafetyApi } from './api';

const statusKey = ['account-status'] as const;

/** X10 Paused / suspended / banned (P11-SAFE-03) with the X10a appeal sheet. */
export function AccountStatusScreen({
  api = safetyApi,
  auth = authApi,
  me: meProp,
}: {
  api?: SafetyApi;
  auth?: Pick<AuthApi, 'signOut'>;
  me?: string | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const session = useSession();
  const me =
    meProp !== undefined ? meProp : session.status === 'signedIn' ? session.session.user.id : null;
  const q = useQuery({ queryKey: statusKey, queryFn: () => api.status() });
  const [appealOpen, setAppealOpen] = useState(false);
  const [reason, setReason] = useState<keyof typeof copy.appealReasons>('mistake');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (q.isPending) return <SkeletonList rows={4} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} layout="screen" />;
  const s = q.data;
  const kind =
    s.status === 'paused' || s.status === 'suspended' || s.status === 'banned' ? s.status : null;
  if (!kind) {
    return (
      <View style={styles.statusRoot} testID="screen-account-status-ok">
        <EmptyState
          icon="check"
          title={copy.appealDecided.overturned}
          action={{ label: copy.openChats, onPress: () => router.replace('/discover') }}
        />
      </View>
    );
  }
  const target = kind === 'banned' ? null : appealTarget(s, me);
  const latestAppeal = s.appeals[0];
  const until = s.paused_until
    ? new Date(s.paused_until).toLocaleDateString(intlLocale, { month: 'short', day: 'numeric' })
    : null;

  const sendAppeal = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await api.appeal(target.subject, target.id, reason, body);
      setAppealOpen(false);
      await qc.invalidateQueries({ queryKey: statusKey });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.statusRoot} testID={`screen-account-status-${kind}`}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="title" accessibilityRole="header">
          {copy.statusTitle[kind]}
        </Text>
        <Text variant="body" tone="ink2">
          {kind === 'paused'
            ? until
              ? fill(copy.statusBody.paused, { until })
              : copy.statusBody.pausedNoDate
            : copy.statusBody[kind]}
        </Text>
        {s.reason && s.reason in copy.reasons ? (
          <Text variant="bodyStrong">{copy.reasons[s.reason as keyof typeof copy.reasons]}</Text>
        ) : null}
        {s.noshows.length ? (
          <Text variant="meta" tone="ink2">{`${copy.noshowsTitle}: ${s.noshows.length}`}</Text>
        ) : null}
        {s.strikes.length ? (
          <Text variant="meta" tone="ink2">{`${copy.strikesTitle}: ${s.strikes.length}`}</Text>
        ) : null}
        {latestAppeal ? (
          <Banner
            kind="info"
            message={
              latestAppeal.status === 'open'
                ? copy.appealed
                : copy.appealDecided[latestAppeal.status]
            }
          />
        ) : null}
        <View style={styles.actions}>
          {kind === 'paused' ? (
            <Button
              label={copy.openChats}
              onPress={() => router.push('/inbox')}
              testID="status-open-chats"
            />
          ) : null}
          {target ? (
            <Button
              label={copy.appeal}
              variant="secondary"
              onPress={() => setAppealOpen(true)}
              testID="status-appeal"
            />
          ) : null}
          <Button label={copy.contact} variant="secondary" onPress={() => router.push('/help')} />
          <Button
            label={copy.signOut}
            variant="text"
            onPress={async () => {
              await auth.signOut('local');
              router.replace('/welcome');
            }}
          />
        </View>
      </ScrollView>
      <Sheet
        visible={appealOpen}
        onClose={() => setAppealOpen(false)}
        title={copy.appealTitle}
        testID="appeal-sheet"
      >
        <View style={styles.sheet}>
          <View style={styles.chips}>
            {(Object.keys(copy.appealReasons) as (keyof typeof copy.appealReasons)[]).map((k) => (
              <Chip
                key={k}
                label={copy.appealReasons[k]}
                selected={reason === k}
                onPress={() => setReason(k)}
              />
            ))}
          </View>
          <TextArea
            label={copy.appealBody}
            placeholder={copy.appealPlaceholder}
            value={body}
            onChangeText={setBody}
            maxLength={500}
            testID="appeal-body"
          />
          {error ? <Banner kind="error" message={error} /> : null}
          <Button
            label={copy.appealSend}
            loading={busy}
            onPress={sendAppeal}
            testID="appeal-send"
          />
        </View>
      </Sheet>
    </View>
  );
}

/** F13 Blocked accounts (P11-SAFE-04). */
export function BlockedScreen({
  api = safetyApi,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
}: {
  api?: SafetyApi;
  mediaBase?: () => string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['blocked'], queryFn: () => api.blocked() });
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  let body;
  if (q.isPending) body = <SkeletonList />;
  else if (q.isError) body = <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  else if (q.data.length === 0)
    body = (
      <EmptyState
        icon="ban"
        title={copy.blockedEmptyTitle}
        body={copy.blockedEmptyBody}
        testID="blocked-empty"
      />
    );
  else
    body = (
      <ScrollView contentContainerStyle={styles.body}>
        {q.data.map((p) => {
          const name = p.display_name ?? '';
          return (
            <View key={p.id} style={styles.row} testID={`blocked-${p.id}`}>
              <Avatar
                name={name}
                uri={p.avatar_path ? mediaUrl(mediaBase(), p.avatar_path) : null}
                size="S"
              />
              <Text variant="body" style={styles.flex}>
                {name}
              </Text>
              <Button
                label={copy.unblock}
                variant="secondary"
                size="S"
                accessibilityHint={fill(copy.unblockName, { name })}
                onPress={async () => {
                  qc.setQueryData(
                    ['blocked'],
                    q.data.filter((x) => x.id !== p.id),
                  );
                  try {
                    await api.unblock(p.id);
                  } catch {
                    void q.refetch();
                  }
                }}
              />
            </View>
          );
        })}
      </ScrollView>
    );

  return (
    <View style={styles.root} testID="screen-blocked">
      <NavBar title={copy.blockedTitle} onLeading={leave} />
      {body}
    </View>
  );
}

/** F16 Delete account: type DELETE (P11-ACC-01). */
export function DeleteAccountScreen({
  auth = authApi,
}: {
  auth?: Pick<AuthApi, 'deleteAccount' | 'signOut'>;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.deleteAccount();
      await auth.signOut('local').catch(() => {});
      router.replace('/welcome');
    } catch {
      setError(copy.deleteFailed);
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="screen-delete-account">
      <NavBar title={copy.deleteTitle} onLeading={leave} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text variant="body">{copy.deleteBody}</Text>
        <Input
          label={copy.deleteType}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="characters"
          autoCorrect={false}
          testID="delete-confirm"
        />
        {error ? <Banner kind="error" message={error} /> : null}
        <Button
          label={copy.deleteButton}
          variant="destructive"
          disabled={typed.trim() !== 'DELETE'}
          loading={busy}
          onPress={remove}
          testID="delete-button"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  statusRoot: { flex: 1, backgroundColor: theme.colors.bg, paddingTop: rt.insets.top },
  body: { padding: theme.space.screen, gap: theme.space.md },
  actions: { gap: theme.space.sm, marginTop: theme.space.lg },
  sheet: { gap: theme.space.md, paddingBottom: theme.space.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.space.rowMin,
  },
  flex: { flex: 1 },
}));
