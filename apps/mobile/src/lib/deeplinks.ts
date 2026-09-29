/**
 * Deep links (P11-STATE-02). Share links are https://{site}/l/{id}; the app
 * scheme is onlyswap://. Expo Router already matches app paths
 * (onlyswap://listing/{id}); this maps the short web paths onto them.
 * Used by app/+native-intent.tsx for universal links and App Links.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function rewriteDeepLink(path: string): string {
  let p = path;
  try {
    // Full URLs arrive for universal links: keep only the path.
    if (/^[a-z]+:\/\//i.test(p)) {
      const u = new URL(p);
      p = u.protocol.startsWith('http') ? u.pathname : `/${u.host}${u.pathname}`;
    }
  } catch {
    return '/';
  }
  const listing = /^\/l\/([^/?#]+)\/?$/.exec(p);
  if (listing) return UUID.test(listing[1]!) ? `/listing/${listing[1]}` : '/link-error';
  // /m/{token} is the friend's web status page; in the app it opens nothing special.
  if (/^\/m\//.test(p)) return '/inbox';
  return p || '/';
}
