import type { QueryClient } from '@tanstack/react-query';
import type { AppStateStatus } from 'react-native';

import { GATE_HREF, systemGate, type AppConfig, type GateInput } from './logic';

type Deps = {
  appState: {
    addEventListener: (
      type: 'change',
      fn: (status: AppStateStatus) => void,
    ) => { remove: () => void };
  };
  queryClient: QueryClient;
  fetchConfig: () => Promise<AppConfig>;
  appVersion: string;
  platform: GateInput['platform'];
  /** The current route path, read at the moment the app comes back. */
  currentPath: () => string;
  navigate: (href: string) => void;
};

const SYSTEM_PATHS: string[] = [GATE_HREF.maintenance, GATE_HREF.update];

/**
 * The launch gate only runs on a cold start, so a person who keeps the app in
 * the background never sees maintenance or a forced update. This re-reads
 * `get_app_config` each time the app returns to the foreground and sends them
 * to Maintenance or Update, or back through the gate once it's over.
 * Offline or a failed fetch changes nothing. Returns the unsubscribe.
 */
export function watchSystemGate(deps: Deps): () => void {
  let busy = false;

  const check = async () => {
    if (busy) return;
    busy = true;
    try {
      const config = await deps.queryClient.fetchQuery({
        queryKey: ['app_config'],
        queryFn: deps.fetchConfig,
        staleTime: 0,
      });
      const path = deps.currentPath();
      // The launch screen runs the full gate itself.
      if (path === '/') return;
      const route = systemGate(config, deps.appVersion, deps.platform);
      if (route) {
        if (path !== GATE_HREF[route]) deps.navigate(GATE_HREF[route]);
      } else if (SYSTEM_PATHS.includes(path)) {
        deps.navigate('/');
      }
    } catch {
      // Keep the current screen; the next foreground tries again.
    } finally {
      busy = false;
    }
  };

  const sub = deps.appState.addEventListener('change', (status) => {
    if (status === 'active') void check();
  });
  return () => sub.remove();
}
