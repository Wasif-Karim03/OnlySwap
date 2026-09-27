// S3 Signature V4 for Cloudflare R2 (and any S3-compatible store, such as the
// local Supabase Storage S3 endpoint used in development). No imports: Web
// Crypto only, so it runs in Deno (Edge Functions) and Node tests unchanged.
//
// presign(): query-string auth for the phone's direct PUT. `content-type` and
// `content-length` are signed headers, so R2 rejects any other size or type
// (SEC-02, T-SEC-18).
// signHeaders(): header auth for server calls (copy, list, delete).

export type S3Config = {
  /** e.g. https://<account>.r2.cloudflarestorage.com (no trailing slash). */
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
export const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}

async function signingKey(secret: string, date: string, region: string, service: string) {
  const kDate = await hmac(enc.encode(`AWS4${secret}`), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

/** RFC 3986 encoding as S3 expects; `/` kept when encoding a path. */
export function uriEncode(value: string, keepSlash = false): string {
  let out = '';
  for (const ch of value) {
    if (/[A-Za-z0-9\-._~]/.test(ch) || (keepSlash && ch === '/')) out += ch;
    else for (const b of enc.encode(ch)) out += `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

/** 20130524T000000Z */
export function amzDate(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** Object URL, path style: `${endpoint}/${bucket}/${key}` with the key encoded. */
export function objectUrl(cfg: Pick<S3Config, 'endpoint'>, bucket: string, key: string): string {
  return `${cfg.endpoint}/${uriEncode(bucket)}/${uriEncode(key, true)}`;
}

function canonicalQuery(params: [string, string][]): string {
  return params
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

function canonicalHeaders(headers: Record<string, string>) {
  const entries = Object.entries(headers)
    .map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, ' ')] as const)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return {
    text: entries.map(([k, v]) => `${k}:${v}\n`).join(''),
    signed: entries.map(([k]) => k).join(';'),
  };
}

async function signature(
  cfg: S3Config,
  when: Date,
  canonicalRequest: string,
): Promise<{ signature: string; scope: string }> {
  const date = amzDate(when).slice(0, 8);
  const scope = `${date}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate(when),
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n');
  const key = await signingKey(cfg.secretAccessKey, date, cfg.region, 's3');
  return { signature: hex(await hmac(key, stringToSign)), scope };
}

/**
 * Presigned URL. `headers` are signed and must be sent unchanged with the
 * request (e.g. content-type and content-length for uploads).
 */
export async function presign(
  cfg: S3Config,
  input: {
    method: 'GET' | 'PUT';
    url: string;
    headers?: Record<string, string>;
    expiresIn: number;
    now?: Date;
  },
): Promise<string> {
  const when = input.now ?? new Date();
  const u = new URL(input.url);
  const { text, signed } = canonicalHeaders({ host: u.host, ...(input.headers ?? {}) });
  const date = amzDate(when).slice(0, 8);
  const params: [string, string][] = [
    ...[...u.searchParams.entries()],
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${cfg.accessKeyId}/${date}/${cfg.region}/s3/aws4_request`],
    ['X-Amz-Date', amzDate(when)],
    ['X-Amz-Expires', String(input.expiresIn)],
    ['X-Amz-SignedHeaders', signed],
  ];
  const query = canonicalQuery(params);
  const canonicalRequest = [input.method, u.pathname, query, text, signed, UNSIGNED_PAYLOAD].join(
    '\n',
  );
  const { signature: sig } = await signature(cfg, when, canonicalRequest);
  return `${u.origin}${u.pathname}?${query}&X-Amz-Signature=${sig}`;
}

/** Headers (Authorization, x-amz-date, x-amz-content-sha256) for a server-side call. */
export async function signHeaders(
  cfg: S3Config,
  input: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    payloadHash?: string;
    now?: Date;
  },
): Promise<Record<string, string>> {
  const when = input.now ?? new Date();
  const u = new URL(input.url);
  const payloadHash = input.payloadHash ?? UNSIGNED_PAYLOAD;
  const all: Record<string, string> = {
    ...(input.headers ?? {}),
    host: u.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate(when),
  };
  const { text, signed } = canonicalHeaders(all);
  const query = canonicalQuery([...u.searchParams.entries()]);
  const canonicalRequest = [input.method, u.pathname, query, text, signed, payloadHash].join('\n');
  const { signature: sig, scope } = await signature(cfg, when, canonicalRequest);
  const { host: _host, ...rest } = all;
  return {
    ...rest,
    authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope},SignedHeaders=${signed},Signature=${sig}`,
  };
}
