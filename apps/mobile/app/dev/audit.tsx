import { Redirect } from 'expo-router';

import { AuditRunner } from '@/features/dev/AuditRunner';

/**
 * Dev-only route for scripts/dev/sim-audit.sh: steps through screens for the
 * simulator screenshot audit. Release builds redirect home.
 */
export default function DevAudit() {
  if (!__DEV__) return <Redirect href="/discover" />;
  return <AuditRunner />;
}
