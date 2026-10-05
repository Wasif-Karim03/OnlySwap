import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Banner, isOffline } from '@/components/Banner';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/ErrorState';
import { Input } from '@/components/Input';
import { GroupedList, ListRow } from '@/components/ListRow';
import { NavBar } from '@/components/NavBar';
import { OptionRow } from '@/components/OptionRow';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { Toggle } from '@/components/Toggle';
import { setAnalyticsOptOut } from '@/lib/analytics';
import { deviceTz, errorText, toAppError } from '@/lib/errors';
import { fill } from '@/lib/format';
import { unregisterPush } from '@/lib/push';
import { setCrashOptOut } from '@/lib/sentry';
import { getSupabase } from '@/lib/supabase';
import { settings as copy } from '@/strings/en';
import { THEME_MODES, useThemeModeStore, type ThemeMode } from '@/theme/mode';

import { authApi, type AuthApi } from '../auth/api';
import { meApi, type Me, type MeApi } from './api';
import { exportApi, type ExportApi } from './exportData';
import { meKey } from './MeScreens';

function useLeave(fallback: '/profile' | '/settings') {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace(fallback));
}

/** F10 Settings (P11-SET-02) with Sign out of all devices. */
export function SettingsScreen({
  auth = authApi,
  beforeSignOut = unregisterPush,
}: {
  auth?: Pick<AuthApi, 'signOut'>;
  beforeSignOut?: () => Promise<void>;
}) {
  const router = useRouter();
  const leave = useLeave('/profile');
  const [confirmAll, setConfirmAll] = useState(false);
  const signOut = async (scope: 'local' | 'global') => {
    await beforeSignOut().catch(() => {});
    await auth.signOut(scope);
    router.replace('/welcome');
  };
  return (
    <View style={styles.root} testID="screen-settings">
      <NavBar title={copy.title} onLeading={leave} />
      <ScrollView contentContainerStyle={styles.body}>
        <GroupedList header={copy.account}>
          <ListRow
            label={copy.notifications}
            icon="bell"
            onPress={() => router.push('/settings/notifications')}
          />
          <ListRow
            label={copy.privacy}
            icon="lock"
            onPress={() => router.push('/settings/privacy')}
          />
          <ListRow
            label={copy.appearance}
            icon="eye"
            onPress={() => router.push('/settings/appearance')}
          />
          <ListRow
            label={copy.school}
            icon="mail"
            onPress={() => router.push('/settings/school')}
          />
          <ListRow
            label={copy.blocked}
            icon="ban"
            onPress={() => router.push('/settings/blocked')}
          />
          <ListRow
            label={copy.data}
            icon="download"
            onPress={() => router.push('/settings/data')}
          />
          <ListRow label={copy.about} icon="info" onPress={() => router.push('/settings/about')} />
        </GroupedList>
        <GroupedList>
          <ListRow label={copy.signOut} onPress={() => void signOut('local')} />
          <ListRow label={copy.signOutAll} onPress={() => setConfirmAll(true)} />
          <ListRow
            label={copy.deleteAccount}
            destructive
            onPress={() => router.push('/settings/delete')}
          />
        </GroupedList>
      </ScrollView>
      <ConfirmDialog
        visible={confirmAll}
        title={copy.signOutAllTitle}
        message={copy.signOutAllBody}
        confirmLabel={copy.signOutAllConfirm}
        onConfirm={async () => {
          setConfirmAll(false);
          await signOut('global');
        }}
        onCancel={() => setConfirmAll(false)}
      />
    </View>
  );
}

/** F12 Privacy: analytics and crash-report switches (P11-SET-02). */
export function PrivacyScreen({ api = meApi }: { api?: MeApi }) {
  const qc = useQueryClient();
  const leave = useLeave('/settings');
  const q = useQuery({ queryKey: meKey, queryFn: () => api.me() });
  const setFlag = async (patch: Partial<Pick<Me, 'analytics_opt_in' | 'crash_reports_opt_in'>>) => {
    qc.setQueryData<Me>(meKey, (old) => (old ? { ...old, ...patch } : old));
    // The device switch applies right away, before the server answers.
    if (patch.analytics_opt_in !== undefined) void setAnalyticsOptOut(!patch.analytics_opt_in);
    if (patch.crash_reports_opt_in !== undefined) setCrashOptOut(!patch.crash_reports_opt_in);
    try {
      await api.updateFlags(patch);
    } catch {
      void q.refetch();
    }
  };
  return (
    <View style={styles.root} testID="screen-privacy">
      <NavBar title={copy.privacyTitle} onLeading={leave} />
      {q.isPending ? (
        <SkeletonList rows={2} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <View style={styles.body}>
          <Toggle
            label={copy.analytics}
            description={copy.analyticsBody}
            value={q.data.analytics_opt_in}
            onChange={(v) => void setFlag({ analytics_opt_in: v })}
          />
          <Toggle
            label={copy.crash}
            description={copy.crashBody}
            value={q.data.crash_reports_opt_in}
            onChange={(v) => void setFlag({ crash_reports_opt_in: v })}
          />
        </View>
      )}
    </View>
  );
}

/** F14 Appearance: Match phone / Light / Dark, saved on the device and the profile. */
export function AppearanceScreen({ api = meApi }: { api?: MeApi }) {
  const leave = useLeave('/settings');
  const mode = useThemeModeStore((s) => s.mode);
  const setMode = useThemeModeStore((s) => s.setMode);
  const choose = (m: ThemeMode) => {
    setMode(m);
    void api.updateFlags({ theme_mode: m }).catch(() => {});
  };
  return (
    <View style={styles.root} testID="screen-appearance">
      <NavBar title={copy.appearanceTitle} onLeading={leave} />
      <View style={styles.body}>
        {THEME_MODES.map((m) => (
          <OptionRow
            key={m}
            kind="radio"
            label={copy.modes[m]}
            selected={mode === m}
            onPress={() => choose(m)}
          />
        ))}
      </View>
    </View>
  );
}

/** F15 Change school email: Supabase sends a confirmation to the new address. */
export function ChangeSchoolScreen({
  updateEmail = async (email: string) => {
    const { error } = await getSupabase().auth.updateUser({ email });
    if (error) throw error;
  },
}: {
  updateEmail?: (email: string) => Promise<void>;
}) {
  const leave = useLeave('/settings');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateEmail(email.trim().toLowerCase());
      setSent(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.root} testID="screen-change-school">
      <NavBar title={copy.schoolTitle} onLeading={leave} />
      <View style={styles.body}>
        <Text variant="body">{copy.schoolBody}</Text>
        {sent ? (
          <Banner kind="info" message={fill(copy.schoolSent, { email })} />
        ) : (
          <>
            <Input
              kind="email"
              label={copy.schoolEmail}
              value={email}
              onChangeText={setEmail}
              testID="school-email"
            />
            {error ? <Banner kind="error" message={error} /> : null}
            <Button
              label={copy.schoolSend}
              loading={busy}
              disabled={!/^[^@\s]+@[^@\s]+\.edu$/i.test(email.trim())}
              onPress={send}
              testID="school-send"
            />
          </>
        )}
      </View>
    </View>
  );
}

/** F18 About: version, legal pages, licenses, contact. */
export function AboutScreen() {
  const router = useRouter();
  const leave = useLeave('/settings');
  const [licenses, setLicenses] = useState(false);
  return (
    <View style={styles.root} testID="screen-about">
      <NavBar title={copy.aboutTitle} onLeading={leave} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="meta" tone="ink2">
          {fill(copy.version, { version: Constants.expoConfig?.version ?? '1.0.0' })}
        </Text>
        <GroupedList>
          {/* Bundled copies, readable offline (P14-LEGAL-01). */}
          <ListRow label={copy.terms} onPress={() => router.push('/legal/terms')} />
          <ListRow label={copy.privacyPolicy} onPress={() => router.push('/legal/privacy')} />
          <ListRow label={copy.rules} onPress={() => router.push('/legal/rules')} />
          <ListRow label={copy.licenses} onPress={() => setLicenses((v) => !v)} />
          <ListRow label={copy.contact} onPress={() => router.push('/help')} />
          <ListRow label={copy.data} onPress={() => router.push('/settings/data')} />
        </GroupedList>
        {licenses ? (
          <Text variant="meta" tone="ink2" testID="about-licenses">
            {copy.licensesBody}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** "Sat 3:00 PM" in the given zone: the export limit can end tomorrow. */
export function exportRetryTime(date: Date, timeZone: string = deviceTz()): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(date);
}

type ExportState = { kind: 'idle' } | { kind: 'sent' } | { kind: 'error'; message: string };

/**
 * F17 Download your data (P11-ACC-02). One tap asks `export-data`; the file's
 * link arrives by email (7 days). Once a day: RATE_LIMITED carries the time
 * it opens again.
 */
export function DataExportScreen({
  api = exportApi,
  timeZone,
}: {
  api?: ExportApi;
  timeZone?: string;
}) {
  const leave = useLeave('/settings');
  const offline = isOffline(useNetInfo());
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ExportState>({ kind: 'idle' });
  const send = async () => {
    setBusy(true);
    setState({ kind: 'idle' });
    try {
      await api.requestExport();
      setState({ kind: 'sent' });
    } catch (e) {
      const err = toAppError(e);
      setState({
        kind: 'error',
        message:
          err.code === 'RATE_LIMITED' && err.retryAt
            ? fill(copy.dataRateLimited, { time: exportRetryTime(err.retryAt, timeZone) })
            : errorText(err, timeZone),
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.root} testID="screen-data-export">
      <NavBar title={copy.dataTitle} onLeading={leave} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="body">{copy.dataIntro}</Text>
        <View style={styles.list}>
          <Text variant="label" tone="ink2" accessibilityRole="header">
            {copy.dataIncludesTitle}
          </Text>
          {copy.dataIncludes.map((line) => (
            <Text key={line} variant="body">
              {`\u2022 ${line}`}
            </Text>
          ))}
        </View>
        <Text variant="meta" tone="ink2">
          {`${copy.dataOthers} ${copy.dataOncePerDay}`}
        </Text>
        {state.kind === 'sent' ? (
          <View testID="data-export-sent" style={styles.list}>
            <Text variant="bodyStrong" accessibilityRole="header">
              {copy.dataSentTitle}
            </Text>
            <Banner kind="info" message={copy.dataSent} />
          </View>
        ) : (
          <>
            {offline ? <Banner kind="offline" message={copy.dataOffline} /> : null}
            {state.kind === 'error' ? <Banner kind="error" message={state.message} /> : null}
            <Button
              label={copy.dataButton}
              loading={busy}
              disabled={offline}
              onPress={() => void send()}
              testID="data-export-send"
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: { padding: theme.space.screen, gap: theme.space.lg },
  list: { gap: theme.space.xs },
}));
