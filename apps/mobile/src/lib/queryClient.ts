import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

import { toAppError } from './errors';

/** Only transient failures are worth retrying; business errors never are. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const { code } = toAppError(error);
  return code === 'ERR_OFFLINE' || code === 'UNKNOWN';
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
      },
      mutations: { retry: false },
    },
  });
}

let wired = false;

/** Connects TanStack Query to NetInfo and AppState once per process. */
export function wireQueryManagers(): void {
  if (wired) return;
  wired = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(!!state.isConnected)),
  );
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (status: AppStateStatus) =>
      handleFocus(status === 'active'),
    );
    return () => sub.remove();
  });
}
