import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from '@/components/Text';

/**
 * Dev builds only. Drives the screenshot audit (scripts/dev/sim-audit.sh): asks
 * the script's local server for the next route, opens it, waits for it to
 * settle, then tells the server to take the simulator screenshot. Navigating
 * from inside the app avoids iOS's "Open in OnlySwap?" prompt on every link.
 * The loop lives at module level so it keeps going after this screen is left.
 */
type Job = { route?: string; settle?: number; end?: boolean };

let running = false;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runAudit(base: string, report: (line: string) => void) {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const job = (await (await fetch(`${base}/next`)).json()) as Job;
      if (job.end || !job.route) break;
      report(job.route);
      if (router.canDismiss()) router.dismissAll();
      router.navigate(job.route as Href);
      await sleep(job.settle ?? 3000);
      await fetch(`${base}/shot`);
    }
    report('done');
  } catch (e) {
    report(`stopped: ${String(e)}`);
  } finally {
    running = false;
  }
}

export function AuditRunner() {
  const { port } = useLocalSearchParams<{ port?: string }>();
  const [status, setStatus] = useState('starting');
  useEffect(() => {
    void runAudit(`http://127.0.0.1:${port ?? '8799'}`, setStatus);
  }, [port]);
  return (
    <View style={styles.root} testID="screen-dev-audit">
      <Text variant="heading">Screenshot audit</Text>
      <Text variant="body" tone="ink2">
        {status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: {
    flex: 1,
    gap: theme.space.sm,
    padding: theme.space.screen,
    paddingTop: rt.insets.top + theme.space.xl,
    backgroundColor: theme.colors.bg,
  },
}));
