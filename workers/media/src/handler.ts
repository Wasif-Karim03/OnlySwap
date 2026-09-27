// Media Worker (P5-MEDIA-01, ARCHITECTURE: Worker serves R2). Public reads of
// listing photos, avatars and share cards from the `onlyswap-media` bucket.
// Everything else is a 404. Signed chat-photo reads arrive in R1.1.
// No imports, so Node tests run the same code as the Worker.

/** The parts of an R2 bucket binding the Worker uses. */
export type Bucket = {
  get: (key: string) => Promise<{
    body: ReadableStream | string | null;
    size: number;
    httpEtag: string;
  } | null>;
};

export type Env = { MEDIA: Bucket };

/** Public prefixes (DATA_MODEL §6). `c/{campus}/chat/` stays private (R1.1). */
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
  // c/{campus}/chat/… and c/{campus}/quad/… are not public in R1.0.
  if (/^c\/[^/]+\/(chat|quad)\//.test(key)) return null;
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  return TYPES[ext] ? key : null;
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
  const key = publicKey(new URL(request.url).pathname);
  if (!key) return notFound();

  const object = await env.MEDIA.get(key);
  if (!object) return notFound();

  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  const headers = {
    'content-type': TYPES[ext] as string,
    'cache-control': CACHE_CONTROL,
    'x-content-type-options': 'nosniff',
    etag: object.httpEtag,
    'content-length': String(object.size),
  };
  if (request.headers.get('if-none-match') === object.httpEtag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}
