import { toAppError, toFunctionError } from '@/lib/errors';
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

/**
 * supabase-js wraps a non-2xx answer in FunctionsHttpError with the Response
 * in `context`; the function's body is `{ error: 'RATE_LIMITED:export_data:<iso>' }`.
 * Shared with every Edge Function caller (lib/errors.ts).
 */
export const functionsError = toFunctionError;

export function createExportApi(invoke: Invoke) {
  return {
    async requestExport(): Promise<ExportQueued> {
      const { data, error } = await invoke('export-data', { body: {} });
      if (error) throw await toFunctionError(error);
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
