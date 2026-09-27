# workers/media

Cloudflare Worker that serves public images from the `onlyswap-media` R2
bucket (P5-MEDIA-01, DATA_MODEL §6).

- `GET`/`HEAD` only. Keys under `c/` and `share/` with `.webp` or `.jpg`.
  Chat and Quad folders, other buckets and anything else answer 404.
- `Cache-Control: public, max-age=31536000, immutable` (keys never change),
  `X-Content-Type-Options: nosniff`, type from the extension, ETag + 304.
- Best-effort limit of 600 requests per minute per IP, per isolate.

Logic lives in `src/handler.ts` and is tested with Node
(`node --experimental-strip-types --test workers/media/src/handler.test.ts`,
part of `pnpm test`).

Local run: `npx wrangler dev -c workers/media/wrangler.toml` (local R2).
Deploy needs the Cloudflare account and buckets from OWNER_TODO (P0-ACC-05).
