// scan-photos core (DEC 152). No imports beyond ./internal.ts, so Node tests
// run it. The model call happens in the media Worker (POST /internal/scan,
// workers/media/src/scan.ts) through its Workers AI binding: no Cloudflare API
// token, and the photo never leaves Cloudflare.
import { isServiceCaller, type InternalResponse } from './internal.ts';

export type ScanRow = {
  id: number;
  kind: 'listing' | 'quad' | 'avatar';
  target_id: string;
  path: string;
};
export type Verdict = { verdict: 'ok' | 'flag' | 'retry'; reason?: string };

const REASONS = new Set(['sexual', 'minor', 'violence', 'weapon', 'drugs', 'hate', 'other']);

/** Thrown by `classify` when the daily free allowance is used up or the API is busy. */
export class RateLimited extends Error {}

/** Reads the Worker's answer. Anything unexpected is retried, never passed as ok. */
export function readVerdict(body: unknown): Verdict {
  const j = (body ?? {}) as { verdict?: unknown; reason?: unknown };
  if (j.verdict === 'ok') return { verdict: 'ok' };
  if (j.verdict === 'flag') {
    const reason = String(j.reason ?? 'other');
    return { verdict: 'flag', reason: REASONS.has(reason) ? reason : 'other' };
  }
  return { verdict: 'retry' };
}

/** One call to the media Worker's scan route. */
export function workerScanner(mediaUrl: string, scanKey: string, doFetch: typeof fetch = fetch) {
  const url = `${mediaUrl.replace(/\/+$/, '')}/internal/scan`;
  return async (path: string): Promise<Verdict> => {
    const res = await doFetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${scanKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (res.status === 429) throw new RateLimited('rate limited');
    if (!res.ok) throw new Error(`scan worker ${res.status}`);
    return readVerdict(await res.json());
  };
}

export type ScanDeps = {
  keys: (string | undefined)[];
  configured: boolean;
  claim: (n: number) => Promise<ScanRow[]>;
  finish: (id: number, v: Verdict) => Promise<void>;
  classify: (path: string) => Promise<Verdict>;
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
  // Without the scan settings nothing is claimed, so photos wait instead of failing.
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
      v = await deps.classify(r.path);
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
