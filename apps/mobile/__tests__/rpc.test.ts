import { createRpc, setRpcBreadcrumb, type RpcClient } from '../src/lib/rpc';

function fakeClient(responses: { data: unknown; error: unknown; status?: number }[]) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  const refreshSession = jest.fn(async (): Promise<{ error: unknown }> => ({ error: null }));
  const client: RpcClient = {
    rpc: (fn, args) => {
      calls.push({ fn, args });
      return Promise.resolve(responses.shift() ?? { data: null, error: null });
    },
    auth: { refreshSession },
  };
  return { client, calls, refreshSession };
}

describe('T-UNIT-LIB-03 lib/rpc', () => {
  afterEach(() => setRpcBreadcrumb(() => {}));

  it('returns data on success', async () => {
    const { client } = fakeClient([{ data: { ok: 1 }, error: null }]);
    await expect(createRpc(() => client)('get_feed', { limit: 5 })).resolves.toEqual({ ok: 1 });
  });

  it('retries once after a token refresh on 401', async () => {
    const { client, calls, refreshSession } = fakeClient([
      { data: null, error: { message: 'JWT expired', code: 'PGRST301' }, status: 401 },
      { data: [1], error: null },
    ]);
    await expect(createRpc(() => client)('get_feed')).resolves.toEqual([1]);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
  });

  it('gives up after one retry and throws SESSION_EXPIRED', async () => {
    const expired = { data: null, error: { message: 'JWT expired' }, status: 401 };
    const { client, calls } = fakeClient([expired, expired]);
    await expect(createRpc(() => client)('get_feed')).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
    expect(calls).toHaveLength(2);
  });

  it('throws SESSION_EXPIRED when the refresh itself fails', async () => {
    const { client, refreshSession } = fakeClient([
      { data: null, error: { message: 'JWT expired' }, status: 401 },
    ]);
    refreshSession.mockResolvedValueOnce({ error: { message: 'invalid refresh token' } });
    await expect(createRpc(() => client)('get_feed')).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
  });

  it('maps server errors to AppError without retrying', async () => {
    const { client, refreshSession } = fakeClient([
      { data: null, error: { code: 'P0001', message: 'OFFER_NOT_PENDING' }, status: 400 },
    ]);
    await expect(createRpc(() => client)('accept_offer', { offer_id: 'x' })).rejects.toMatchObject({
      code: 'OFFER_NOT_PENDING',
    });
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('records only the RPC name in the breadcrumb, never the args', async () => {
    const crumbs: unknown[] = [];
    setRpcBreadcrumb((c) => crumbs.push(c));
    const { client } = fakeClient([{ data: null, error: null }]);
    await createRpc(() => client)('send_message', { body: 'meet at 5', client_id: 'abc' });
    expect(crumbs).toEqual([{ category: 'rpc', message: 'send_message' }]);
    expect(JSON.stringify(crumbs)).not.toContain('meet at 5');
  });
});
