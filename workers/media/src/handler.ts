// Media Worker (P5-MEDIA-01, ARCHITECTURE: Worker serves R2). Public reads of
// listing photos, avatars and share cards from the `onlyswap-media` bucket.
// Quad photos (R1.1) are public like listing photos (unguessable keys).
// Everything else is a 404; chat photos are read through signed URLs (S47).
// No imports, so Node tests run the same code as the Worker.

/** The parts of an R2 bucket binding the Worker uses. */
export type Bucket = {
  get: (key: string) => Promise<{
    body: ReadableStream | string | null;
    size: number;
    httpEtag: string;
  } | null>;
};

export type Env = { MEDIA: Bucket; MEDIA_SIGNING_KEY?: string };

/** Public prefixes (DATA_MODEL §6). `c/{campus}/chat/` stays private. */
export const PUBLIC_PREFIXES = ['c/', 'share/'] as const;

const TYPES: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

/** Object keys are immutable (a new photo gets a new uuid), so cache for a year. */
export const CACHE_CONTROL = 'public, max-age=31536000, immutable';

export const RATE_LIMIT = { windowMs: 60_000, max: 600 };

/** Best-effort, per isolate: enough to blunt a single noisy client. */
const hits = new Map<string, { start: number; count: number }>();

export function rateLimited(ip: string, now: number): boolean {
  const cur = hits.get(ip);
  if (!cur || now - cur.start >= RATE_LIMIT.windowMs) {
    hits.set(ip, { start: now, count: 1 });
    if (hits.size > 10_000) hits.clear();
    return false;
  }
  cur.count += 1;
  return cur.count > RATE_LIMIT.max;
}

export function resetRateLimit(): void {
  hits.clear();
}

/** A key the Worker may serve, or null. */
export function publicKey(pathname: string): string | null {
  let key: string;
  try {
    key = decodeURIComponent(pathname.replace(/^\/+/, ''));
  } catch {
    return null;
  }
  if (!key || key.length > 512) return null;
  if (key.split('/').some((part) => part === '' || part === '.' || part === '..')) return null;
  if (!PUBLIC_PREFIXES.some((p) => key.startsWith(p))) return null;
  // c/{campus}/chat/… is never public (signed reads only).
  if (/^c\/[^/]+\/chat\//.test(key)) return null;
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  return TYPES[ext] ? key : null;
}

/** c/{campus}/chat/{chat}/{file}: private, served only with a valid signature. */
export function chatKey(pathname: string): string | null {
  let key: string;
  try {
    key = decodeURIComponent(pathname.replace(/^\/+/, ''));
  } catch {
    return null;
  }
  if (
    key.length > 512 ||
    key.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    return null;
  }
  return /^c\/[^/]+\/chat\/[^/]+\/[0-9a-f-]{36}_(full|thumb)\.webp$/.test(key) ? key : null;
}

/** Hex HMAC-SHA256 of "key:exp" (matches private.media_signed_path in SQL). */
export async function signChat(secret: string, key: string, exp: number): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', k, enc.encode(`${key}:${exp}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string compare (equal lengths only). */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Seconds a signed chat URL is still good for, or null when it isn't valid. */
export async function chatAccess(
  url: URL,
  secret: string | undefined,
  now: number,
): Promise<number | null> {
  const key = chatKey(url.pathname);
  const exp = Number(url.searchParams.get('exp'));
  const sig = url.searchParams.get('sig') ?? '';
  if (!key || !secret || !Number.isInteger(exp) || !/^[0-9a-f]{64}$/.test(sig)) return null;
  const left = exp - Math.floor(now / 1000);
  if (left <= 0 || left > 3 * 3600) return null;
  return same(await signChat(secret, key, exp), sig) ? left : null;
}

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=60' },
  });
}

export async function handle(
  request: Request,
  env: Env,
  now: number = Date.now(),
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (rateLimited(ip, now)) {
    return new Response('Too many requests', { status: 429, headers: { 'retry-after': '60' } });
  }
  const url = new URL(request.url);
  let key = publicKey(url.pathname);
  let cacheControl = CACHE_CONTROL;
  if (!key) {
    // Chat photos (R1.1): only with a valid, unexpired signature.
    const left = await chatAccess(url, env.MEDIA_SIGNING_KEY, now);
    if (left === null) return notFound();
    key = chatKey(url.pathname);
    cacheControl = `private, max-age=${left}`;
  }
  if (!key) return notFound();

  const object = await env.MEDIA.get(key);
  if (!object) return notFound();

  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  const headers = {
    'content-type': TYPES[ext] as string,
    'cache-control': cacheControl,
    'x-content-type-options': 'nosniff',
    // Public images may be drawn by the web app (share card capture).
    'access-control-allow-origin': '*',
    etag: object.httpEtag,
    'content-length': String(object.size),
  };
  if (request.headers.get('if-none-match') === object.httpEtag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}
