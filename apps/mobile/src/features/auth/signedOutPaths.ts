/**
 * Routes a signed-out person may open. Everything else (chat, offers, meetups,
 * settings, profile, feed) needs a session, so a deep link to it sends the
 * person to Welcome instead of an empty or erroring screen (launch item 4).
 */
const SIGNED_OUT_PATHS: ReadonlySet<string> = new Set([
  '/',
  '/welcome',
  '/email',
  '/verify',
  '/age',
  '/maintenance',
  '/update',
  '/link-error',
]);

/** Pages anyone can read without an account. */
const PUBLIC_PREFIXES: readonly string[] = ['/legal', '/help'];

export function isSignedOutPath(pathname: string): boolean {
  if (SIGNED_OUT_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
