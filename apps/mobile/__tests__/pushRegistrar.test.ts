import { createPushRegistrar, type PushRegistrar } from '../src/lib/pushRegistrar';

function setup(opts: { token?: string | null; userId?: string | null } = {}) {
  const state = {
    token: opts.token === undefined ? 'ExpoToken[a]' : opts.token,
    userId: opts.userId ?? 'u1',
  };
  const send = jest.fn(async (_token: string) => {});
  const getToken = jest.fn(async () => state.token);
  const registrar = createPushRegistrar({ getToken, getUserId: async () => state.userId, send });
  return { state, send, getToken, registrar };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('QA-H1 push registrar', () => {
  it('registers the token once and skips repeat calls', async () => {
    const { send, registrar } = setup();
    await registrar.register();
    await registrar.register();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('ExpoToken[a]');
  });

  it('cannot loop when every token fetch fires the listener again', async () => {
    const send = jest.fn(async (_token: string) => {});
    let fetches = 0;
    let registrar: PushRegistrar | null = null;
    registrar = createPushRegistrar({
      getToken: async () => {
        fetches += 1;
        if (fetches > 50) throw new Error('loop');
        // What iOS does: fetching the token emits the device token event.
        void registrar?.onDeviceToken('device-1');
        return 'ExpoToken[a]';
      },
      getUserId: async () => 'u1',
      send,
    });
    await registrar.register();
    await tick();
    await registrar.onDeviceToken('device-1');
    await tick();
    expect(send).toHaveBeenCalledTimes(1);
    expect(fetches).toBeLessThanOrEqual(2);
  });

  it('shares one in-flight registration between concurrent callers', async () => {
    const { send, getToken, registrar } = setup();
    await Promise.all([registrar.register(), registrar.register(), registrar.onDeviceToken('d1')]);
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('re-registers when the device token really rotates', async () => {
    const { state, send, registrar } = setup();
    await registrar.onDeviceToken('d1');
    state.token = 'ExpoToken[b]';
    await registrar.onDeviceToken('d2');
    expect(send.mock.calls.map((c) => c[0])).toEqual(['ExpoToken[a]', 'ExpoToken[b]']);
  });

  it('registers again after reset (sign-out)', async () => {
    const { send, registrar } = setup();
    await registrar.register();
    registrar.reset();
    await registrar.register();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('registers again for a new user even without reset', async () => {
    const { state, send, registrar } = setup();
    await registrar.register();
    state.userId = 'u2';
    await registrar.register();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does nothing without permission', async () => {
    const { send, registrar } = setup({ token: null });
    await expect(registrar.register()).resolves.toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('retries after a failed send', async () => {
    const { send, registrar } = setup();
    send.mockRejectedValueOnce(new Error('RATE_LIMITED'));
    await expect(registrar.register()).rejects.toThrow('RATE_LIMITED');
    await registrar.register();
    expect(send).toHaveBeenCalledTimes(2);
  });
});
