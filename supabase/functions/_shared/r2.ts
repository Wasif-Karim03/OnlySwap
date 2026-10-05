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

export function createR2(cfg: R2Env, doFetch: Fetch = fetch) {
  async function call(
    method: string,
    url: string,
    headers: Record<string, string> = {},
    body?: BodyInit,
    allow404 = method === 'DELETE',
  ) {
    const signed = await signHeaders(cfg, { method, url, headers });
    const res = await doFetch(url, { method, headers: signed, body });
    if (!res.ok && !(allow404 && res.status === 404)) {
      throw new Error(`r2 ${method} ${res.status}`);
    }
    return res;
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

    /** Keys under a prefix (ListObjectsV2, all pages). */
    async list(bucket: string, prefix: string): Promise<string[]> {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const u = new URL(`${cfg.endpoint}/${bucket}`);
        u.searchParams.set('list-type', '2');
        u.searchParams.set('prefix', prefix);
        if (token) u.searchParams.set('continuation-token', token);
        const xml = await (await call('GET', u.toString())).text();
        for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(decodeXml(m[1] as string));
        const next = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml);
        token =
          /<IsTruncated>true<\/IsTruncated>/.test(xml) && next
            ? decodeXml(next[1] as string)
            : undefined;
      } while (token);
      return keys;
    },

    /** Server-side write of a small object (chat archives, exports). */
    async put(bucket: string, key: string, body: string, type = 'application/json'): Promise<void> {
      await call('PUT', objectUrl(cfg, bucket, key), { 'content-type': type }, body);
    },

    async delete(bucket: string, key: string): Promise<void> {
      await call('DELETE', objectUrl(cfg, bucket, key));
    },

    /** Deletes every object under a prefix; returns how many were removed. */
    async deletePrefix(bucket: string, prefix: string): Promise<number> {
      const keys = await this.list(bucket, prefix);
      for (const key of keys) await this.delete(bucket, key);
      return keys.length;
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
