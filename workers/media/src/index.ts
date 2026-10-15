// Cloudflare Worker entry (wrangler.toml `main`). All logic is in ./handler.ts.
import { handle, type Env } from './handler.ts';

type Ctx = { waitUntil: (promise: Promise<unknown>) => void };

export default {
  fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const cache = (globalThis as unknown as { caches: { default: Cache } }).caches.default;
    return handle(request, env, Date.now(), {
      cache: { match: (r) => cache.match(r), put: (r, res) => cache.put(r, res) },
      waitUntil: (p) => ctx.waitUntil(p),
    });
  },
};
