/**
 * Development-only step markers printed to the Metro log, used to find which
 * step of a flow a native (Android) crash happens in. No-ops in release and
 * in tests; never carries user content.
 */
export function devTrace(step: string): void {
  if (!__DEV__ || process.env.NODE_ENV === 'test') return;
  // eslint-disable-next-line no-console -- dev-only crash bisection, stripped from release
  console.log(`[trace] ${step}`);
}
