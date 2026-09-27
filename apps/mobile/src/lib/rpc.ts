import { toAppError } from './errors';

/** Minimal surface of supabase-js we use, so tests can inject a fake. */
export type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown; status?: number }>;
  auth: { refreshSession: () => Promise<{ error: unknown }> };
};

type Breadcrumb = (crumb: { category: 'rpc'; message: string }) => void;

let breadcrumb: Breadcrumb = () => {};

/** Sentry wiring (P1-LIB-02) plugs in here. Only the RPC name is recorded, never args. */
export function setRpcBreadcrumb(fn: Breadcrumb): void {
  breadcrumb = fn;
}

function isExpired(error: unknown, status?: number): boolean {
  return status === 401 || toAppError(error).code === 'SESSION_EXPIRED';
}

/**
 * Calls a Postgres RPC. On an expired session it refreshes the token and
 * retries exactly once (T-UNIT-LIB-03). Errors are thrown as AppError.
 */
export function createRpc(getClient: () => RpcClient) {
  return async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const client = getClient();
    breadcrumb({ category: 'rpc', message: fn });
    let res;
    try {
      res = await client.rpc(fn, args);
      if (res.error && isExpired(res.error, res.status)) {
        const refreshed = await client.auth.refreshSession();
        if (refreshed.error) throw { status: 401, message: 'refresh failed' };
        res = await client.rpc(fn, args);
      }
    } catch (e) {
      throw toAppError(e);
    }
    if (res.error) {
      const err = res.error as { status?: number };
      throw toAppError(
        res.status && err.status === undefined
          ? { ...(res.error as object), status: res.status }
          : res.error,
      );
    }
    return res.data as T;
  };
}
