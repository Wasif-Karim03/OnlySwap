/**
 * Deep links (P11-STATE-02). Share links are https://{site}/l/{id} and invite
 * links https://{site}/i/{code}; the app scheme is onlyswap://. Expo Router
 * already matches app paths (onlyswap://listing/{id}); this maps the short web
 * paths onto them. Used by app/+native-intent.tsx for universal links and App Links.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Same shape the site's /i/[code] page accepts (apps/site/src/lib/invite.ts INVITE_RE). */
const INVITE = /^[A-Za-z0-9]{4,16}$/;

/** The path of a link: full URLs keep only the path; onlyswap://x/y becomes /x/y. Null when unreadable. */
export function linkPath(path: string): string | null {
  try {
    if (/^[a-z]+:\/\//i.test(path)) {
      const u = new URL(path);
      return u.protocol.startsWith('http') ? u.pathname : `/${u.host}${u.pathname}`;
    }
  } catch {
    return null;
  }
  return path;
}

/** R11-INVITE-01: the code in /i/{code} (upper case, as stored), or null. */
export function inviteCodeFromLink(path: string): string | null {
  const p = linkPath(path);
  const m = p ? /^\/i\/([^/?#]+)\/?(?:[?#].*)?$/.exec(p) : null;
  return m && INVITE.test(m[1]!) ? m[1]!.toUpperCase() : null;
}

export function rewriteDeepLink(path: string): string {
  const p = linkPath(path);
  if (p === null) return '/';
  // Invites open the launch gate: signed out it goes to Welcome (the code is
  // kept for the sign-up by +native-intent), signed in it goes home.
  if (/^\/i(\/|$)/.test(p)) return '/';
  const listing = /^\/l\/([^/?#]+)\/?$/.exec(p);
  if (listing) return UUID.test(listing[1]!) ? `/listing/${listing[1]}` : '/link-error';
  // /m/{token} is the friend's web status page; in the app it opens nothing special.
  if (/^\/m\//.test(p)) return '/inbox';
  return p || '/';
}
