// R2 client for Edge Functions (P5-MEDIA-02, P5-MEDIA-04). Talks S3 over
// fetch with SigV4 (./s3.ts); no SDK. Works against Cloudflare R2 in
// staging/prod and the local Supabase Storage S3 endpoint in development.

import { objectUrl, presign, signHeaders, type S3Config } from './s3.ts';

export type R2Env = S3Config & {
  mediaBucket: string;
  privateBucket: string;
  /**
   * Host the phone uses for presigned uploads when it differs from the one
   * the function uses (local dev: the function reaches storage inside Docker,
   * the Simulator through 127.0.0.1). Defaults to `endpoint`.
   */
  publicEndpoint?: string;
};

type Env = { get: (name: string) => string | undefined };

/** Reads R2_* settings; throws a clear error naming anything missing. */
export function r2FromEnv(env: Env): R2Env {
  const need = (name: string) => {
    const v = env.get(name);
    if (!v) throw new Error(`missing ${name}`);
    return v;
  };
  return {
    endpoint: need('R2_ENDPOINT').replace(/\/+$/, ''),
    region: env.get('R2_REGION') || 'auto',
    accessKeyId: need('R2_ACCESS_KEY_ID'),
    secretAccessKey: need('R2_SECRET_ACCESS_KEY'),
    mediaBucket: env.get('R2_BUCKET_MEDIA') || 'onlyswap-media',
    privateBucket: env.get('R2_BUCKET_PRIVATE') || 'onlyswap-private',
    publicEndpoint: env.get('R2_PUBLIC_ENDPOINT')?.replace(/\/+$/, '') || undefined,
  };
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Bounds a deleteUnder run (RV-02): `stop` is asked before every list page
 * and every object, and `signal` cancels the request in flight.
 */
export type DeleteUnderOptions = { stop?: () => boolean; signal?: AbortSignal };

/**
 * A deleteUnder failure; `deleted` lists the keys removed before it, and
 * `stopped` is true when it ended because time ran out (not an R2 error).
 */
export class R2PartialDeleteError extends Error {
  readonly deleted: readonly string[];
  readonly stopped: boolean;
  constructor(cause: unknown, deleted: readonly string[], stopped = false) {
    // Same message as the failed call (method and status only, no keys).
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'R2PartialDeleteError';
    this.deleted = [...deleted];
    this.stopped = stopped;
  }
}

/** Keys a failed deleteUnder had already removed (none for other errors). */
export function deletedBeforeFailure(error: unknown): string[] {
  const deleted = (error as { deleted?: unknown } | null)?.deleted;
  return Array.isArray(deleted) ? deleted.filter((k): k is string => typeof k === 'string') : [];
}

type ListPage = { keys: string[]; next: string | undefined };

const halted = (opts: DeleteUnderOptions): boolean =>
  opts.signal?.aborted === true || opts.stop?.() === true;

export function createR2(cfg: R2Env, doFetch: Fetch = fetch) {
  async function call(
    method: string,
    url: string,
    headers: Record<string, string> = {},
    body?: BodyInit,
    allow404 = method === 'DELETE',
    signal?: AbortSignal,
  ) {
    const signed = await signHeaders(cfg, { method, url, headers });
    const res = await doFetch(url, { method, headers: signed, body, signal });
    if (!res.ok && !(allow404 && res.status === 404)) {
      throw new Error(`r2 ${method} ${res.status}`);
    }
    return res;
  }

  /** One ListObjectsV2 page; `next` is the continuation token when truncated. */
  async function listPage(
    bucket: string,
    prefix: string,
    token: string | undefined,
    opts: DeleteUnderOptions,
  ): Promise<ListPage> {
    if (halted(opts)) throw new R2PartialDeleteError(new Error('r2 stopped'), [], true);
    const u = new URL(`${cfg.endpoint}/${bucket}`);
    u.searchParams.set('list-type', '2');
    u.searchParams.set('prefix', prefix);
    if (token) u.searchParams.set('continuation-token', token);
    const res = await call('GET', u.toString(), {}, undefined, false, opts.signal);
    const xml = await res.text();
    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => decodeXml(m[1] as string));
    const next = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml);
    return {
      keys,
      next:
        /<IsTruncated>true<\/IsTruncated>/.test(xml) && next
          ? decodeXml(next[1] as string)
          : undefined,
    };
  }

  return {
    /** Presigned PUT with the exact type and size signed in (SEC-02). */
    presignPut(key: string, type: string, size: number, expiresIn = 600): Promise<string> {
      const endpoint = cfg.publicEndpoint ?? cfg.endpoint;
      return presign(cfg, {
        method: 'PUT',
        url: objectUrl({ endpoint }, cfg.mediaBucket, key),
        headers: { 'content-type': type, 'content-length': String(size) },
        expiresIn,
      });
    },

    /** Presigned GET, e.g. a data export in the private bucket (P11-ACC-02). */
    presignGet(bucket: string, key: string, expiresIn = 3600): Promise<string> {
      const endpoint = cfg.publicEndpoint ?? cfg.endpoint;
      return presign(cfg, {
        method: 'GET',
        url: objectUrl({ endpoint }, bucket, key),
        expiresIn,
      });
    },

    /** Keys under a prefix (ListObjectsV2, all pages); stops when `opts` says so. */
    async list(bucket: string, prefix: string, opts: DeleteUnderOptions = {}): Promise<string[]> {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const page = await listPage(bucket, prefix, token, opts);
        keys.push(...page.keys);
        token = page.next;
      } while (token);
      return keys;
    },

    /** Server-side write of a small object (chat archives, exports). */
    async put(bucket: string, key: string, body: string, type = 'application/json'): Promise<void> {
      await call('PUT', objectUrl(cfg, bucket, key), { 'content-type': type }, body);
    },

    async delete(bucket: string, key: string, signal?: AbortSignal): Promise<void> {
      await call('DELETE', objectUrl(cfg, bucket, key), {}, undefined, true, signal);
    },

    /**
     * Deletes every object under a prefix; returns the keys removed (for a
     * cache purge). When a delete fails, the error it throws carries the keys
     * already removed (`deleted`), so their URLs can still be purged (IR-05).
     * `opts` bounds the run (RV-02): checked before every list page and every
     * object, and the request in flight is cancelled by its signal; either
     * way the error is marked `stopped` and still carries `deleted`.
     */
    async deleteUnder(
      bucket: string,
      prefix: string,
      opts: DeleteUnderOptions = {},
    ): Promise<string[]> {
      // Page by page (IR3-02): a page's keys are deleted before the next page
      // is listed, so a stop part way through a large prefix keeps progress.
      const deleted: string[] = [];
      let token: string | undefined;
      do {
        let page: ListPage;
        try {
          page = await listPage(bucket, prefix, token, opts);
        } catch (error) {
          if (error instanceof R2PartialDeleteError) {
            throw new R2PartialDeleteError(error, deleted, error.stopped);
          }
          throw new R2PartialDeleteError(error, deleted, halted(opts));
        }
        for (const key of page.keys) {
          if (halted(opts)) throw new R2PartialDeleteError(new Error('r2 stopped'), deleted, true);
          try {
            await this.delete(bucket, key, opts.signal);
          } catch (error) {
            throw new R2PartialDeleteError(error, deleted, halted(opts));
          }
          deleted.push(key);
        }
        token = page.next;
      } while (token);
      return deleted;
    },

    /** True when the object exists (HEAD), e.g. an evidence copy (IR-02). */
    async exists(bucket: string, key: string): Promise<boolean> {
      const res = await call('HEAD', objectUrl(cfg, bucket, key), {}, undefined, true);
      return res.status !== 404;
    },

    /** Deletes every object under a prefix; returns how many were removed. */
    async deletePrefix(bucket: string, prefix: string): Promise<number> {
      return (await this.deleteUnder(bucket, prefix)).length;
    },

    /**
     * Server-side copy (CopyObject), e.g. media → private/evidence. Returns
     * false when the source is already gone (nothing to keep).
     */
    async copy(
      fromBucket: string,
      fromKey: string,
      toBucket: string,
      toKey: string,
    ): Promise<boolean> {
      const res = await call(
        'PUT',
        objectUrl(cfg, toBucket, toKey),
        {
          'x-amz-copy-source': `/${fromBucket}/${fromKey.split('/').map(encodeURIComponent).join('/')}`,
        },
        undefined,
        true,
      );
      return res.status !== 404;
    },
  };
}

export type R2 = ReturnType<typeof createR2>;

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
