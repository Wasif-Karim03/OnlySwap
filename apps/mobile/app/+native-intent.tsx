import { rewriteDeepLink } from '@/lib/deeplinks';

/** Maps universal links / App Links (https://site/l/{id}) onto app routes (P11-STATE-02). */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return rewriteDeepLink(path);
}
