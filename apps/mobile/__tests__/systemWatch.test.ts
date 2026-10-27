import { QueryClient } from '@tanstack/react-query';
import type { AppStateStatus } from 'react-native';

import type { AppConfig } from '@/features/auth/logic';
import { systemGate } from '@/features/auth/logic';
import { watchSystemGate } from '@/features/auth/systemWatch';

// No GC timers, so Jest can exit.
const newClient = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });

const base: AppConfig = {
  maintenance: { enabled: false, until: null },
  minVersionIos: '1.0.0',
  minVersionAndroid: '1.0.0',
  rulesVersion: '1',
  rulesChanges: [],
  chatPhotosEnabled: false,
} as unknown as AppConfig;

function setup(opts: { path?: string; config?: () => Promise<AppConfig>; version?: string } = {}) {
  let emit: (s: AppStateStatus) => void = () => {};
  const remove = jest.fn();
  const navigate = jest.fn();
  const fetchConfig = jest.fn(opts.config ?? (() => Promise.resolve(base)));
  let path = opts.path ?? '/discover';
  const stop = watchSystemGate({
    appState: {
      addEventListener: (_t, fn) => {
        emit = fn;
        return { remove };
      },
    },
    queryClient: newClient(),
    fetchConfig,
    appVersion: opts.version ?? '1.2.0',
    platform: 'ios',
    currentPath: () => path,
    navigate,
  });
  const foreground = async () => {
    emit('active');
    await new Promise((r) => setTimeout(r, 0));
  };
  return {
    emit,
    foreground,
    navigate,
    fetchConfig,
    remove,
    stop,
    setPath: (p: string) => (path = p),
  };
}

describe('T-UNIT-AUTH-08 foreground re-checks maintenance and forced update', () => {
  it('systemGate: maintenance wins, then version; web never updates', () => {
    const on = { ...base, maintenance: { enabled: true, until: null } };
    expect(systemGate(on, '0.1.0', 'ios')).toBe('maintenance');
    expect(systemGate({ ...base, minVersionIos: '2.0.0' }, '1.9.9', 'ios')).toBe('update');
    expect(systemGate({ ...base, minVersionAndroid: '2.0.0' }, '1.9.9', 'ios')).toBeNull();
    expect(systemGate({ ...base, minVersionAndroid: '2.0.0' }, '1.9.9', 'android')).toBe('update');
    expect(systemGate({ ...base, minVersionIos: '9.0.0' }, '1.0.0', 'web')).toBeNull();
    expect(systemGate(base, '1.0.0', 'ios')).toBeNull();
  });

  it('sends the person to Maintenance when it turned on in the background', async () => {
    const t = setup({
      config: () => Promise.resolve({ ...base, maintenance: { enabled: true, until: null } }),
    });
    await t.foreground();
    expect(t.navigate).toHaveBeenCalledWith('/maintenance');
  });

  it('sends the person to Update when the minimum version moved past theirs', async () => {
    const t = setup({ config: () => Promise.resolve({ ...base, minVersionIos: '2.0.0' }) });
    await t.foreground();
    expect(t.navigate).toHaveBeenCalledWith('/update');
  });

  it('does nothing when all is normal, or when already on the right screen', async () => {
    const t = setup();
    await t.foreground();
    expect(t.fetchConfig).toHaveBeenCalledTimes(1);
    expect(t.navigate).not.toHaveBeenCalled();

    const m = setup({
      path: '/maintenance',
      config: () => Promise.resolve({ ...base, maintenance: { enabled: true, until: null } }),
    });
    await m.foreground();
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it('goes back through the gate once maintenance is over', async () => {
    const t = setup({ path: '/maintenance' });
    await t.foreground();
    expect(t.navigate).toHaveBeenCalledWith('/');
  });

  it('leaves the launch screen to its own gate', async () => {
    const t = setup({
      path: '/',
      config: () => Promise.resolve({ ...base, maintenance: { enabled: true, until: null } }),
    });
    await t.foreground();
    expect(t.navigate).not.toHaveBeenCalled();
  });

  it('keeps the current screen when the fetch fails (offline)', async () => {
    const t = setup({ config: () => Promise.reject(new Error('offline')) });
    await t.foreground();
    expect(t.navigate).not.toHaveBeenCalled();
  });

  it('ignores background and inactive, and unsubscribes on stop', async () => {
    const t = setup();
    t.emit('background');
    t.emit('inactive');
    await new Promise((r) => setTimeout(r, 0));
    expect(t.fetchConfig).not.toHaveBeenCalled();
    t.stop();
    expect(t.remove).toHaveBeenCalledTimes(1);
  });
});
