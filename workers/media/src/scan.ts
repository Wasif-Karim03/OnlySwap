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
export type ScanEnv = { MEDIA: ScanBucket; AI?: Ai; SCAN_KEY?: string };

export const SCAN_PATH = '/internal/scan';
export const SCAN_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

/** What the model is asked. Short, strict and JSON only. */
export const SCAN_PROMPT = [
  'You screen photos posted on a marketplace for college students.',
  'Flag the photo if it shows any of: nudity or sexual content; a minor in a sexual or suggestive way;',
  'gore or graphic violence; a weapon (gun, knife sold as a weapon, explosives); illegal drugs or drug',
  'paraphernalia; hate symbols. Everyday items, furniture, clothes on a hanger or worn by a clothed person,',
  'rooms, food, books and electronics are fine.',
  'Answer with JSON only: {"verdict":"ok"} or {"verdict":"flag","reason":"sexual|minor|violence|weapon|drugs|hate|other"}.',
].join(' ');

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
  const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());

  const ai = env.AI;
  const ask = () =>
    ai.run(SCAN_MODEL, {
      messages: [
        { role: 'system', content: SCAN_PROMPT },
        { role: 'user', content: 'Screen this photo.' },
      ],
      image: [...bytes],
      max_tokens: 60,
      temperature: 0,
    });
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
    return json(200, { verdict: 'retry' });
  }
  const text =
    typeof out === 'string' ? out : String((out as { response?: unknown } | null)?.response ?? '');
  return json(200, parseVerdict(text));
}
