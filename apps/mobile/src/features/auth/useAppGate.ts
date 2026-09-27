import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Application from 'expo-application';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { getStorage } from '@/lib/storage';

import { authApi, type AuthApi } from './api';
import { computeGate, type GateRoute } from './logic';
import { useSession, type SessionSource } from './useSession';

/**
 * How long launch waits for `get_app_config` before opening anyway with the
 * config checks skipped (A01 splash budget ≤700 ms). The gate re-runs when
 * the config arrives, so maintenance and update still apply.
 */
export const CONFIG_WAIT_MS = 600;

type Options = {
  api?: AuthApi;
  sessionSource?: SessionSource;
  appVersion?: string;
  notificationsAsked?: () => boolean;
};

export type AppGate = {
  route: GateRoute | null;
  userId: string | null;
  /** The profile couldn't load (offline or server error): show a retry, never guess a route. */
  failed: boolean;
  error: unknown;
  retry: () => void;
};

/** Combines session, app config and the user's profile into one route (A01). */
export function useAppGate(options: Options = {}): AppGate {
  const api = options.api ?? authApi;
  const session = useSession(options.sessionSource);
  const userId = session.status === 'signedIn' ? session.session.user.id : null;

  const config = useQuery({ queryKey: ['app_config'], queryFn: () => api.getAppConfig() });
  const profile = useQuery({
    queryKey: ['profile', userId, 'gate'],
    queryFn: () => api.getGateProfile(userId as string),
    enabled: userId !== null,
  });

  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), CONFIG_WAIT_MS);
    return () => clearTimeout(t);
  }, []);

  const configValue = config.data ?? (config.isError || waited ? null : undefined);
  const profileValue = userId === null ? undefined : profile.data;

  const route = computeGate({
    config: configValue,
    appVersion: options.appVersion ?? Application.nativeApplicationVersion ?? '0',
    platform: Platform.OS === 'android' ? 'android' : 'ios',
    session: session.status,
    profile: profileValue,
    notificationsAsked: (options.notificationsAsked ?? defaultNotificationsAsked)(),
  });

  return {
    route,
    userId,
    failed: userId !== null && profile.isError && profile.data === undefined,
    error: profile.error,
    retry: () => void profile.refetch(),
  };
}

function defaultNotificationsAsked(): boolean {
  return getStorage().get('onboarding.notificationsAsked') === true;
}

/**
 * After an onboarding step saves, hand back to the launch gate. The cached
 * profile is dropped first so the gate reads the new row instead of routing
 * back to the step that was just finished.
 */
export function useGateHandoff(): () => void {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.removeQueries({ queryKey: ['profile'] });
    router.replace('/');
  }, [queryClient, router]);
}
