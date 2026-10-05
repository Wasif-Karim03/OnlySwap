// export-data core (P11-ACC-02, API §5, T-INT-EXPORT-01). No runtime imports
// beyond ./deleteAccount.ts (itself import-free), so it runs under Deno (the
// Edge Function) and Node's test runner unchanged.
//
// Flow: verify the caller's JWT → private.start_data_export (1 a day; the
// data_exports row and the private-bucket key) → private.export_user_data
// (the JSON) → put it at onlyswap-private/exports/{uid}/{id}.json → presigned
// GET valid 7 days → private.finish_data_export (row ready, data_export email
// with the link). Any failure after the start marks the row failed, which
// doesn't use up the day.

import { serverCode } from './deleteAccount.ts';

/** SigV4 caps presigned URLs at 7 days, which is also the promise in the email. */
export const EXPORT_LINK_SECONDS = 7 * 24 * 60 * 60;

export type StartedExport = { id: string; key: string; expires_at?: string };

export type ExportDeps = {
  /** Resolves the user id from a bearer token, or null when it isn't valid. */
  userIdFromToken: (token: string) => Promise<string | null>;
  start: (userId: string) => Promise<StartedExport>;
  collect: (userId: string) => Promise<Record<string, unknown>>;
  /** Writes the JSON to the private bucket. */
  upload: (key: string, body: string) => Promise<void>;
  /** Presigned GET for a private-bucket key. */
  presignGet: (key: string, expiresIn: number) => Promise<string>;
  finish: (exportId: string, url: string) => Promise<void>;
  fail: (exportId: string) => Promise<void>;
  /** Public media base (the media Worker), for photo links; paths only when unset. */
  mediaUrl?: string | null;
  log?: (event: string, data?: Record<string, unknown>) => void;
};

export type ExportRequest = { method: string; authorization: string | null };
export type ExportResponse = { status: number; body: Record<string, unknown> };

const fail = (status: number, code: string): ExportResponse => ({ status, body: { error: code } });

const STATUS_BY_CODE: Record<string, number> = {
  NOT_AUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
};

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Adds full links next to public media paths (listing photos, the avatar,
 * Quad photos). Chat photos stay as paths: the Worker serves them only with a
 * short-lived signature, so a link in a file would stop working.
 */
export function withMediaUrls(data: Json, mediaUrl?: string | null): Json {
  const base = (mediaUrl ?? '').replace(/\/+$/, '');
  if (!base) return data;
  const link = (path: unknown) =>
    typeof path === 'string' && path ? `${base}/${path.replace(/^\/+/, '')}` : null;
  const out: Json = { ...data };
  if (isObj(out.profile)) {
    out.profile = { ...out.profile, avatar_url: link(out.profile.avatar_path) };
  }
  if (Array.isArray(out.listings)) {
    out.listings = out.listings.map((l) =>
      isObj(l) && Array.isArray(l.photos)
        ? {
            ...l,
            photos: l.photos.map((p) =>
              isObj(p) ? { ...p, url: link(p.path), thumb_url: link(p.thumb_path) } : p,
            ),
          }
        : l,
    );
  }
  if (isObj(out.quad) && Array.isArray(out.quad.posts)) {
    out.quad = {
      ...out.quad,
      posts: out.quad.posts.map((p) =>
        isObj(p) && p.photo_path ? { ...p, photo_url: link(p.photo_path) } : p,
      ),
    };
  }
  return out;
}

export async function handleExportData(
  req: ExportRequest,
  deps: ExportDeps,
): Promise<ExportResponse> {
  if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED');

  const token = /^Bearer\s+(.+)$/i.exec(req.authorization ?? '')?.[1]?.trim();
  if (!token) return fail(401, 'NOT_AUTHENTICATED');
  const userId = await deps.userIdFromToken(token);
  if (!userId) return fail(401, 'NOT_AUTHENTICATED');

  let started: StartedExport;
  try {
    started = await deps.start(userId);
  } catch (error) {
    const code = serverCode(error);
    if (code) return fail(STATUS_BY_CODE[code.split(':')[0] ?? ''] ?? 400, code);
    deps.log?.('export_data.start_failed');
    return fail(500, 'UNKNOWN');
  }
  // The key must be the caller's own folder; anything else is a server bug.
  if (!started.key.startsWith(`exports/${userId}/`)) {
    deps.log?.('export_data.bad_key');
    await deps.fail(started.id).catch(() => undefined);
    return fail(500, 'UNKNOWN');
  }

  try {
    const data = withMediaUrls(await deps.collect(userId), deps.mediaUrl);
    await deps.upload(started.key, JSON.stringify(data, null, 2));
    const url = await deps.presignGet(started.key, EXPORT_LINK_SECONDS);
    await deps.finish(started.id, url);
  } catch (error) {
    // Only the step's error text (e.g. "r2 PUT 403"); never ids, keys or data.
    const detail = error instanceof Error ? error.message.slice(0, 80) : 'unknown';
    deps.log?.('export_data.failed', { detail });
    await deps.fail(started.id).catch(() => undefined);
    return fail(500, 'UNKNOWN');
  }

  deps.log?.('export_data.done');
  return {
    status: 200,
    body: { status: 'queued', ...(started.expires_at ? { expires_at: started.expires_at } : {}) },
  };
}
