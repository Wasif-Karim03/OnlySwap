// Cloudflare cache purge for deleted media (LR-02, DEC 139). No imports, so
// the Edge Functions (Deno) and Node tests run the same code.
//
// The media Worker caches public objects at the edge for up to 24 h, keyed on
// the canonical URL `${MEDIA_URL}/${key}` (workers/media/src/handler.ts).
// When an account goes, delete-account and the manifest sweep purge those
// URLs by single file (Free zones allow it, 30 URLs per call). Chat photos
// are never cached (signed, private), so they are skipped. Browser caches
// cannot be revoked; the edge TTL is the backstop when a purge fails.

export type PurgeConfig = { zoneId: string; token: string; mediaUrl: string };

type Env = { get: (name: string) => string | undefined };
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Cloudflare's limit for purge by single file. */
export const PURGE_BATCH = 30;

const CHAT_KEY = /^c\/[^/]+\/chat\//;

/** CF_ZONE_ID, CF_CACHE_PURGE_TOKEN and MEDIA_URL, or null when any is missing. */
export function purgeConfigFromEnv(env: Env): PurgeConfig | null {
  const zoneId = env.get('CF_ZONE_ID')?.trim();
  const token = env.get('CF_CACHE_PURGE_TOKEN')?.trim();
  const mediaUrl = env.get('MEDIA_URL')?.trim();
  if (!zoneId || !token || !mediaUrl) return null;
  return { zoneId, token, mediaUrl };
}

/** The URL the Worker caches a key under (identical to its cache key). */
export function canonicalMediaUrl(mediaUrl: string, key: string): string {
  return `${mediaUrl.replace(/\/+$/, '')}/${key}`;
}

/**
 * Purges the public URLs of the keys; returns how many URLs were sent. Throws
 * on any failure. `signal` bounds the whole purge (RV-02): it cancels the
 * request in flight and no further batch starts once it has fired.
 */
export async function purgeKeys(
  cfg: PurgeConfig,
  keys: string[],
  doFetch: Fetch = fetch,
  signal?: AbortSignal,
): Promise<number> {
  const files = keys
    .filter((k) => !CHAT_KEY.test(k))
    .map((k) => canonicalMediaUrl(cfg.mediaUrl, k));
  for (let i = 0; i < files.length; i += PURGE_BATCH) {
    if (signal?.aborted) throw new Error('purge stopped');
    const res = await doFetch(
      `https://api.cloudflare.com/client/v4/zones/${cfg.zoneId}/purge_cache`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ files: files.slice(i, i + PURGE_BATCH) }),
        signal,
      },
    );
    if (!res.ok) throw new Error(`purge ${res.status}`);
    const body = (await res.json().catch(() => null)) as { success?: unknown } | null;
    if (body?.success !== true) throw new Error('purge not successful');
  }
  return files.length;
}
