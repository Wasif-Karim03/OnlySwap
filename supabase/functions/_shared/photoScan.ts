// scan-photos core (DEC 152). No imports beyond ./internal.ts, so Node tests
// run it. The Edge Function wires the database, the media URL and Cloudflare
// Workers AI.
import { isServiceCaller, type InternalResponse } from './internal.ts';

export type ScanRow = {
  id: number;
  kind: 'listing' | 'quad' | 'avatar';
  target_id: string;
  path: string;
};
export type Verdict = { verdict: 'ok' | 'flag' | 'retry'; reason?: string };

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

export function toDataUri(bytes: Uint8Array, contentType: string): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${contentType || 'image/webp'};base64,${btoa(bin)}`;
}

/** Thrown by `classify` when the daily free allowance is used up or the API is busy. */
export class RateLimited extends Error {}

/** One Workers AI call. Returns the model's text. */
export function workersAiClassifier(
  accountId: string,
  token: string,
  doFetch: typeof fetch = fetch,
) {
  return async (image: string): Promise<string> => {
    const res = await doFetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${SCAN_MODEL}`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: SCAN_PROMPT },
            { role: 'user', content: 'Screen this photo.' },
          ],
          image,
          max_tokens: 60,
          temperature: 0,
        }),
      },
    );
    if (res.status === 429) throw new RateLimited('rate limited');
    if (!res.ok) throw new Error(`workers ai ${res.status}`);
    const j = (await res.json()) as { result?: { response?: string } | string };
    return typeof j.result === 'string' ? j.result : (j.result?.response ?? '');
  };
}

export type ScanDeps = {
  keys: (string | undefined)[];
  configured: boolean;
  claim: (n: number) => Promise<ScanRow[]>;
  finish: (id: number, v: Verdict) => Promise<void>;
  /** The photo as a data URI (public media URL fetch). */
  image: (path: string) => Promise<string>;
  classify: (image: string) => Promise<string>;
  log?: (event: string, counts: Record<string, number>) => void;
};

/** scan-photos: claim, screen, record. Rate limits put the rest back for the next run. */
export async function handleScanPhotos(
  req: { method: string; authorization: string | null },
  deps: ScanDeps,
  limit = 10,
): Promise<InternalResponse> {
  if (req.method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
  if (!isServiceCaller(req.authorization, deps.keys))
    return { status: 401, body: { error: 'NOT_AUTHENTICATED' } };
  // Without Cloudflare settings nothing is claimed, so photos wait instead of failing.
  if (!deps.configured) return { status: 200, body: { ok: true, skipped: 'not_configured' } };

  const rows = await deps.claim(limit);
  const counts = { claimed: rows.length, passed: 0, flagged: 0, retried: 0 };
  let limited = false;
  for (const r of rows) {
    if (limited) {
      await deps.finish(r.id, { verdict: 'retry' });
      counts.retried++;
      continue;
    }
    let v: Verdict;
    try {
      v = parseVerdict(await deps.classify(await deps.image(r.path)));
    } catch (e) {
      if (e instanceof RateLimited) limited = true;
      v = { verdict: 'retry' };
    }
    await deps.finish(r.id, v);
    if (v.verdict === 'ok') counts.passed++;
    else if (v.verdict === 'flag') counts.flagged++;
    else counts.retried++;
  }
  // Counts only; no paths or user ids in logs.
  deps.log?.('scan-photos', counts);
  return { status: 200, body: { ok: true, ...counts } };
}
