import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Linking, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { EmptyState } from '@/components/EmptyState';
import { getEnv } from '@/lib/env';
import { fill } from '@/lib/format';
import { system as copy, intlLocale } from '@/strings';

import { authApi, type AuthApi } from '../auth/api';

/** X11 Update required (P11-STATE-01): app_config min_version_* is above this build. */
export function UpdateScreen({
  openUrl = (u: string) => Linking.openURL(u),
  site = () => getEnv().EXPO_PUBLIC_SITE_URL,
}: {
  openUrl?: (u: string) => Promise<unknown>;
  site?: () => string;
}) {
  return (
    <View style={styles.root} testID="screen-update">
      <EmptyState
        icon="download"
        tile="accent"
        title={copy.updateTitle}
        body={copy.updateBody}
        action={{
          label: copy.updateButton,
          onPress: () => void openUrl(`${site().replace(/\/+$/, '')}/download`),
        }}
      />
    </View>
  );
}

/** "9:00 AM" today; with the weekday ("Tue 9:00 AM") when the end is another day (3.01). */
function backAround(end: Date, today: Date = new Date()): string {
  const sameDay = end.toDateString() === today.toDateString();
  return end.toLocaleString(intlLocale, {
    ...(sameDay ? {} : { weekday: 'short' }),
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** X12 Maintenance (P11-STATE-01): app_config maintenance.enabled; Try again re-runs the launch gate. */
export function MaintenanceScreen({ api = authApi }: { api?: Pick<AuthApi, 'getAppConfig'> }) {
  const router = useRouter();
  // Same key as the launch gate (useAppGate), so Try again routes from fresh
  // config instead of the cached "maintenance on" (UX audit 2026-10-25).
  const q = useQuery({
    queryKey: ['app_config'],
    queryFn: () => api.getAppConfig(),
    staleTime: 0,
    refetchInterval: 60_000,
  });
  const until = q.data?.maintenance.until ? backAround(new Date(q.data.maintenance.until)) : null;
  return (
    <View style={styles.root} testID="screen-maintenance">
      <EmptyState
        icon="tool"
        title={copy.maintenanceTitle}
        body={
          until
            ? `${copy.maintenanceBody} ${fill(copy.maintenanceUntil, { time: until })}`
            : copy.maintenanceBody
        }
        action={{
          label: copy.tryAgain,
          onPress: () => {
            void q.refetch().then(() => router.replace('/'));
          },
        }}
      />
    </View>
  );
}

/** X31 A share link that doesn't point at a listing, and any unknown app path. */
export function LinkErrorScreen({ kind = 'link' }: { kind?: 'link' | 'missing' }) {
  const router = useRouter();
  return (
    <View style={styles.root} testID={kind === 'link' ? 'screen-link-error' : 'screen-not-found'}>
      <EmptyState
        icon="alert"
        title={kind === 'link' ? copy.linkErrorTitle : copy.notFoundTitle}
        body={kind === 'link' ? copy.linkErrorBody : copy.notFoundBody}
        action={{ label: copy.goHome, onPress: () => router.replace('/discover') }}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingTop: rt.insets.top,
    justifyContent: 'center',
  },
}));
