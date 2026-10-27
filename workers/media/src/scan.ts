// Photo screening (DEC 152). POST /internal/scan {path} with
// `Authorization: Bearer <SCAN_KEY>`; only the scan-photos Edge Function calls it.
// The Worker reads the photo straight from R2 and asks Workers AI through its
// AI binding, so no Cloudflare API token exists anywhere and the photo never
// leaves Cloudflare. Free plan: 10,000 neurons a day.
//   -> 200 {verdict: 'ok'} | {verdict: 'flag', reason} | {verdict: 'retry'}
//   -> 429 when the daily allowance is used up (the rest wait for the next run)
// No imports, so Node tests run the same code as the Worker.

export type Ai = { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };
export type ScanBucket = {
  get: (key: string) => Promise<{ body: ReadableStream | string | null } | null>;
};
/** The slice of the Images binding the scan uses (wrangler.toml [images]). */
export type Images = {
  input: (stream: ReadableStream) => {
    transform: (t: Record<string, unknown>) => {
      output: (o: { format: string; quality?: number }) => Promise<{ response: () => Response }>;
    };
  };
};
export type ScanEnv = { MEDIA: ScanBucket; AI?: Ai; SCAN_KEY?: string; IMAGES?: Images };

/** Long side of the JPEG the model sees: enough to judge, small enough to be quick. */
export const SCAN_WIDTH = 768;

/**
 * WebP to a small JPEG for the model (staging test 2026-10-25: Llama 3.2 Vision
 * answered without a verdict on our WebP photos). No binding, over the free
 * allowance, or any error: the original bytes go instead.
 */
export async function toScanJpeg(env: ScanEnv, bytes: Uint8Array): Promise<Uint8Array> {
  if (!env.IMAGES) return bytes;
  try {
    const stream = new Response(bytes).body;
    if (!stream) return bytes;
    const out = await env.IMAGES.input(stream)
      .transform({ width: SCAN_WIDTH, height: SCAN_WIDTH, fit: 'scale-down' })
      .output({ format: 'image/jpeg', quality: 80 });
    return new Uint8Array(await out.response().arrayBuffer());
  } catch {
    return bytes;
  }
}

export const SCAN_PATH = '/internal/scan';
export const SCAN_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

/** What the model is asked. Short, strict and JSON only. */
export const SCAN_PROMPT = [
  'You screen photos posted on a marketplace for college students.',
  'Flag the photo if it shows any of: nudity or sexual content; a minor in a sexual or suggestive way;',
  'gore or graphic violence; any weapon, including every kind of knife (kitchen knives too), guns, pepper spray and explosives; illegal drugs or drug',
  'paraphernalia; hate symbols. Everyday items, furniture, clothes on a hanger or worn by a clothed person,',
  'rooms, food, books and electronics are fine.',
  'Answer with JSON only: {"verdict":"ok"} or {"verdict":"flag","reason":"sexual|minor|violence|weapon|drugs|hate|other"}.',
].join(' ');

/** Short system turn: the model needs one with an image (Workers AI 3030). */
export const SCAN_SYSTEM = 'You check photos for a student marketplace. You answer only with JSON.';

/** The ask after the rules: the exact shape, nothing else. */
export const SCAN_ASK =
  'Look at the photo and reply with one line of JSON and nothing else, for example {"verdict":"ok"} or {"verdict":"flag","reason":"weapon"}.';

/** Second try when the first answer had no JSON. */
export const SCAN_FOLLOW_UP =
  'Reply with only the JSON now: {"verdict":"ok"} or {"verdict":"flag","reason":"sexual|minor|violence|weapon|drugs|hate|other"}.';

const REASONS = new Set(['sexual', 'minor', 'violence', 'weapon', 'drugs', 'hate', 'other']);

export type Verdict = { verdict: 'ok' | 'flag' | 'retry'; reason?: string };

/** Reads the model's answer. Anything unreadable is retried, never passed as ok. */
export function parseVerdict(text: string): Verdict {
  const match = /\{[^{}]*\}/.exec(text ?? '');
  if (match) {
    try {
      const j = JSON.parse(match[0]) as { verdict?: string; reason?: string };
      if (j.verdict === 'ok') return { verdict: 'ok' };
      if (j.verdict === 'flag') {
        const reason = String(j.reason ?? 'other').toLowerCase();
        return { verdict: 'flag', reason: REASONS.has(reason) ? reason : 'other' };
      }
    } catch {
      // fall through
    }
  }
  return { verdict: 'retry' };
}

/** Public photo keys only (listing, Quad, avatar); never chat photos. */
export function scanKey(path: unknown): string | null {
  if (typeof path !== 'string' || path.length > 512 || path.includes('%')) return null;
  if (!/^c\/[A-Za-z0-9_-]+\/[A-Za-z0-9/_.-]+\.(webp|jpe?g)$/.test(path)) return null;
  if (path.split('/').some((p) => p === '' || p === '.' || p === '..')) return null;
  if (/^c\/[^/]+\/chat\//.test(path)) return null;
  return path;
}

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function handleScan(request: Request, env: ScanEnv): Promise<Response> {
  if (!env.AI || !env.SCAN_KEY) return json(503, { error: 'NOT_CONFIGURED' });
  const auth = request.headers.get('authorization') ?? '';
  if (!same(auth, `Bearer ${env.SCAN_KEY}`)) return json(401, { error: 'NOT_AUTHENTICATED' });
  let path: unknown;
  try {
    path = ((await request.json()) as { path?: unknown }).path;
  } catch {
    return json(400, { error: 'INVALID:path' });
  }
  const key = scanKey(path);
  if (!key) return json(400, { error: 'INVALID:path' });

  const object = await env.MEDIA.get(key);
  // Deleted before the scan ran: nothing left to show anyone.
  if (!object || object.body === null) return json(200, { verdict: 'ok', gone: true });
  const bytes = await toScanJpeg(
    env,
    new Uint8Array(await new Response(object.body).arrayBuffer()),
  );

  const ai = env.AI;
  // The rules ride in the user turn with the photo: with a separate system
  // turn the model described the photo instead (staging test 2026-10-25).
  // Workers AI needs a system turn next to the image (error 3030 without
  // one); the rules ride in the user turn, where the model follows them.
  const first = [
    { role: 'system', content: SCAN_SYSTEM },
    { role: 'user', content: `${SCAN_PROMPT}\n\n${SCAN_ASK}` },
  ];
  const ask = (messages: { role: string; content: string }[] = first) =>
    ai.run(SCAN_MODEL, { messages, image: [...bytes], max_tokens: 60, temperature: 0 });
  // Workers AI parses a JSON answer itself and hands back an object, not text.
  const textOf = (o: unknown): string => {
    const r = typeof o === 'string' ? o : (o as { response?: unknown } | null)?.response;
    if (typeof r === 'string') return r;
    if (r && typeof r === 'object') return JSON.stringify(r);
    return '';
  };
  let out: unknown;
  try {
    try {
      out = await ask();
    } catch (e) {
      // Meta's license is accepted once per account with the prompt "agree".
      if (!/agree/i.test(message(e))) throw e;
      await ai.run(SCAN_MODEL, { prompt: 'agree' });
      out = await ask();
    }
  } catch (e) {
    const m = message(e);
    if (/429|rate|limit|neuron|capacity|quota/i.test(m))
      return json(429, { error: 'RATE_LIMITED' });
    // Error text only (no photo data), so a failing format shows in Worker logs.
    console.log(JSON.stringify({ event: 'scan', error: m.slice(0, 200) }));
    // The error text rides along (this route is SCAN_KEY only) so a test call
    // shows why: scripts/deploy/test-photo-scan.command.
    return json(200, { verdict: 'retry', error: m.slice(0, 200) });
  }
  let text = textOf(out);
  let verdict = parseVerdict(text);
  if (verdict.verdict === 'retry') {
    // It answered in words: ask once more for the JSON alone.
    try {
      const again = await ask([
        ...first,
        { role: 'assistant', content: text.slice(0, 400) },
        { role: 'user', content: SCAN_FOLLOW_UP },
      ]);
      const text2 = textOf(again);
      const v2 = parseVerdict(text2);
      if (v2.verdict !== 'retry') verdict = v2;
      else text = text2 || text;
    } catch (e) {
      if (/429|rate|limit|neuron|capacity|quota/i.test(message(e)))
        return json(429, { error: 'RATE_LIMITED' });
    }
  }
  // An answer with no verdict carries the model's words, so a test call shows why.
  return json(200, verdict.verdict === 'retry' ? { ...verdict, raw: text.slice(0, 200) } : verdict);
}
