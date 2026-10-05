import { parseServerMessage, toAppError, type AppError } from '@/lib/errors';
import { getSupabase } from '@/lib/supabase';

/**
 * F17 Download your data (P11-ACC-02, API §5 `export-data`). One POST with the
 * user's JWT (supabase.functions.invoke adds it); the link arrives by email.
 */

type Invoke = (
  name: string,
  options: { body: Record<string, unknown> },
) => PromiseLike<{ data: unknown; error: unknown }>;

export type ExportQueued = { status: 'queued'; expiresAt: string | null };

type FunctionsErrorLike = {
  name?: unknown;
  message?: unknown;
  context?: { status?: unknown; json?: () => Promise<unknown>; clone?: () => unknown };
};

/**
 * supabase-js wraps a non-2xx answer in FunctionsHttpError with the Response
 * in `context`; the function's body is `{ error: 'RATE_LIMITED:export_data:<iso>' }`.
 * A request that never left the phone is FunctionsFetchError.
 */
export async function functionsError(error: unknown): Promise<AppError> {
  const e = (typeof error === 'object' && error !== null ? error : {}) as FunctionsErrorLike;
  if (e.name === 'FunctionsFetchError') {
    return toAppError({ name: 'TypeError', message: 'Network request failed' });
  }
  if (e.name === 'FunctionsHttpError' && e.context) {
    const status = typeof e.context.status === 'number' ? e.context.status : undefined;
    let code: string | undefined;
    try {
      const body = (await e.context.json?.()) as { error?: unknown } | undefined;
      if (typeof body?.error === 'string') code = body.error;
    } catch {
      code = undefined;
    }
    const parsed = code ? parseServerMessage(code) : undefined;
    if (parsed) return parsed;
    if (status === 401) return toAppError({ status: 401, message: 'NOT_AUTHENTICATED' });
    return toAppError({ message: code ?? '' });
  }
  return toAppError(error);
}

export function createExportApi(invoke: Invoke) {
  return {
    async requestExport(): Promise<ExportQueued> {
      const { data, error } = await invoke('export-data', { body: {} });
      if (error) throw await functionsError(error);
      const res = (data ?? {}) as { status?: unknown; expires_at?: unknown };
      if (res.status !== 'queued') throw toAppError({ message: 'export-data: unexpected answer' });
      return {
        status: 'queued',
        expiresAt: typeof res.expires_at === 'string' ? res.expires_at : null,
      };
    },
  };
}

export type ExportApi = ReturnType<typeof createExportApi>;

export const exportApi: ExportApi = createExportApi((name, options) =>
  getSupabase().functions.invoke(name, options),
);
