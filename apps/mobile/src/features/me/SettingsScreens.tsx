import { useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
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
import { errorText } from '@/lib/errors';
import { fill } from '@/lib/format';
import { unregisterPush } from '@/lib/push';
import { setCrashOptOut } from '@/lib/sentry';
import { getSupabase } from '@/lib/supabase';
import { settings as copy } from '@/strings/en';
import { THEME_MODES, useThemeModeStore, type ThemeMode } from '@/theme/mode';

import { authApi, type AuthApi } from '../auth/api';
import { meApi, type Me, type MeApi } from './api';
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
        </GroupedList>
        {licenses ? (
          <Text variant="meta" tone="ink2" testID="about-licenses">
            {copy.licensesBody}
          </Text>
        ) : null}
        <Text variant="meta" tone="ink2">
          {copy.dataBody}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: { padding: theme.space.screen, gap: theme.space.lg },
}));
