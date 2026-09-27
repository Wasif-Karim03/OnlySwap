// Cloudflare Worker entry (wrangler.toml `main`). All logic is in ./handler.ts.
import { handle, type Env } from './handler.ts';

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
};
