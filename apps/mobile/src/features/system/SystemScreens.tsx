import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Linking, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { EmptyState } from '@/components/EmptyState';
import { getEnv } from '@/lib/env';
import { fill } from '@/lib/format';
import { system as copy } from '@/strings/en';

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

/** X12 Maintenance (P11-STATE-01): app_config maintenance.enabled; Try again re-runs the launch gate. */
export function MaintenanceScreen({ api = authApi }: { api?: Pick<AuthApi, 'getAppConfig'> }) {
  const router = useRouter();
  const q = useQuery({ queryKey: ['app-config'], queryFn: () => api.getAppConfig() });
  const until = q.data?.maintenance.until
    ? new Date(q.data.maintenance.until).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;
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
        action={{ label: copy.tryAgain, onPress: () => router.replace('/') }}
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
