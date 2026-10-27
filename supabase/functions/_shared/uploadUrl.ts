// upload-url core (P5-MEDIA-02, API §5, DATA_MODEL §6). No imports, so the
// Edge Function (Deno) and Node tests (T-FN-04) run the same code.
//
// The phone asks for presigned PUT URLs; the server checks ownership with
// private.can_upload, picks the object keys itself, records them for the
// uploader before any URL exists (0246: the attach proof, the 160-object
// quota and the upload GC), and signs the exact content-type and
// content-length so R2 refuses anything else (SEC-02).

export type UploadKind = 'listing' | 'avatar' | 'share' | 'quad' | 'chat';
export type Variant = 'full' | 'thumb';

export type FileRequest = { idx: number; variant: Variant; type: string; size: number };

export type Upload = {
  idx: number;
  variant: Variant;
  key: string;
  url: string;
  headers: { 'content-type': string; 'content-length': string };
};

/** DATA_MODEL §6 limits. */
export const LIMITS: Record<UploadKind, Partial<Record<Variant, { type: string; max: number }>>> = {
  listing: {
    full: { type: 'image/webp', max: 2 * 1024 * 1024 },
    thumb: { type: 'image/webp', max: 200 * 1024 },
  },
  avatar: { full: { type: 'image/webp', max: 300 * 1024 } },
  share: { full: { type: 'image/jpeg', max: 500 * 1024 } },
  quad: {
    full: { type: 'image/webp', max: 2 * 1024 * 1024 },
    thumb: { type: 'image/webp', max: 200 * 1024 },
  },
  chat: {
    full: { type: 'image/webp', max: 2 * 1024 * 1024 },
    thumb: { type: 'image/webp', max: 200 * 1024 },
  },
};

export const MAX_FILES = 16;
export const MAX_LISTING_PHOTOS = 8;
export const URL_TTL_S = 600;

export type UploadDeps = {
  userIdFromToken: (token: string) => Promise<string | null>;
  /** private.authorize_upload: deletion gate, 60/h and 120/day, can_upload; returns the campus id or throws P0001. */
  authorize: (userId: string, kind: UploadKind, targetId: string, count: number) => Promise<string>;
  /** private.record_uploads: the quota and one pending row per key (not for share cards); throws P0001. */
  recordUploads: (
    userId: string,
    kind: UploadKind,
    targetId: string,
    items: { key: string; size: number }[],
  ) => Promise<unknown>;
  presignPut: (key: string, type: string, size: number) => Promise<string>;
  uuid: () => string;
};

export type Response = { status: number; body: Record<string, unknown> };

const fail = (status: number, code: string): Response => ({ status, body: { error: code } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_BY_CODE: Record<string, number> = {
  NOT_AUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_ACTIVE: 403,
  RATE_LIMITED: 429,
};

/** Validates the file list for a kind; returns an INVALID detail or null. */
export function validateFiles(kind: UploadKind, files: unknown): string | null {
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES) return 'files';
  const seen = new Set<string>();
  for (const f of files as Partial<FileRequest>[]) {
    const limit = f && typeof f === 'object' ? LIMITS[kind][f.variant as Variant] : undefined;
    if (!limit) return 'variant';
    if (f.type !== limit.type) return 'type';
    if (!Number.isInteger(f.size) || (f.size as number) <= 0 || (f.size as number) > limit.max) {
      return 'size';
    }
    const max = kind === 'listing' ? MAX_LISTING_PHOTOS : 1;
    if (!Number.isInteger(f.idx) || (f.idx as number) < 0 || (f.idx as number) >= max) return 'idx';
    const id = `${f.idx}:${f.variant}`;
    if (seen.has(id)) return 'files';
    seen.add(id);
  }
  return null;
}

/** Object keys (DATA_MODEL §6). The server picks them; the phone never names a key. */
export function objectKey(
  kind: UploadKind,
  campus: string,
  userId: string,
  targetId: string,
  variant: Variant,
  uuid: string,
): string {
  if (kind === 'listing') return `c/${campus}/l/${targetId}/${uuid}_${variant}.webp`;
  if (kind === 'avatar') return `c/${campus}/u/${userId}/avatar_${uuid}.webp`;
  if (kind === 'quad') return `c/${campus}/quad/${targetId}/${uuid}_${variant}.webp`;
  if (kind === 'chat') return `c/${campus}/chat/${targetId}/${uuid}_${variant}.webp`;
  return `share/${targetId}.jpg`;
}

function serverCode(error: unknown): string | null {
  const message =
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : '';
  return /^[A-Z_]+(:|$)/.test(message) ? message : null;
}

/** A P0001 code becomes its HTTP status; anything else is a plain 500. */
function sqlFailure(error: unknown): Response {
  const code = serverCode(error);
  if (code) return fail(STATUS_BY_CODE[code.split(':')[0] ?? ''] ?? 400, code);
  return fail(500, 'UNKNOWN');
}

export async function handleUploadUrl(
  req: { method: string; authorization: string | null; body: unknown },
  deps: UploadDeps,
): Promise<Response> {
  if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED');
  const token = /^Bearer\s+(.+)$/i.exec(req.authorization ?? '')?.[1]?.trim();
  if (!token) return fail(401, 'NOT_AUTHENTICATED');
  const userId = await deps.userIdFromToken(token);
  if (!userId) return fail(401, 'NOT_AUTHENTICATED');

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
    string,
    unknown
  >;
  const kind = body.kind as UploadKind;
  if (!['listing', 'avatar', 'share', 'quad', 'chat'].includes(kind))
    return fail(400, 'INVALID:kind');
  const targetId = String(body.target_id ?? '');
  if (!UUID.test(targetId)) return fail(400, 'INVALID:target_id');
  const bad = validateFiles(kind, body.files);
  if (bad) return fail(400, `INVALID:${bad}`);
  const files = body.files as FileRequest[];

  let campus: string;
  try {
    campus = await deps.authorize(userId, kind, targetId, files.length);
  } catch (error) {
    return sqlFailure(error);
  }

  // One uuid per photo so the full image and its thumbnail share a name.
  const ids = new Map<number, string>();
  const keys = files.map((f) => {
    if (!ids.has(f.idx)) ids.set(f.idx, deps.uuid());
    return objectKey(kind, campus, userId, targetId, f.variant, ids.get(f.idx) as string);
  });

  // Recorded before any URL is signed: a refused batch never gets URLs.
  if (kind !== 'share') {
    try {
      await deps.recordUploads(
        userId,
        kind,
        targetId,
        files.map((f, i) => ({ key: keys[i] as string, size: f.size })),
      );
    } catch (error) {
      return sqlFailure(error);
    }
  }

  const uploads: Upload[] = [];
  for (const [i, f] of files.entries()) {
    const key = keys[i] as string;
    uploads.push({
      idx: f.idx,
      variant: f.variant,
      key,
      url: await deps.presignPut(key, f.type, f.size),
      headers: { 'content-type': f.type, 'content-length': String(f.size) },
    });
  }
  return { status: 200, body: { uploads, expires_in: URL_TTL_S } };
}
