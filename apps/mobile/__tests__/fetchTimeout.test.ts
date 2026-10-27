import { toAppError } from '../src/lib/errors';
import { fetchWithTimeout } from '../src/lib/supabase';

/** A fetch that never settles unless its signal aborts, like a dead connection. */
function hangingFetch(): typeof fetch {
  return ((_input: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
      );
    })) as typeof fetch;
}

describe('fetchWithTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('fails a hung request after the deadline, as an offline error the screen can retry', async () => {
    const pending = fetchWithTimeout('https://x/rest/v1/categories', {}, 1000, hangingFetch());
    const outcome = pending.catch((e: unknown) => e);

    jest.advanceTimersByTime(1000);

    expect(toAppError(await outcome).code).toBe('ERR_OFFLINE');
  });

  it('passes a fast response through untouched', async () => {
    const res = { ok: true } as Response;
    const base = jest.fn(async () => res) as unknown as typeof fetch;

    await expect(fetchWithTimeout('https://x', { method: 'POST' }, 1000, base)).resolves.toBe(res);
    expect(base).toHaveBeenCalledWith('https://x', expect.objectContaining({ method: 'POST' }));
  });

  it("still honours the caller's own abort", async () => {
    const outer = new AbortController();
    const pending = fetchWithTimeout('https://x', { signal: outer.signal }, 60_000, hangingFetch());
    const outcome = pending.catch((e: unknown) => e);

    outer.abort();

    expect(await outcome).toMatchObject({ name: 'AbortError' });
  });
});
