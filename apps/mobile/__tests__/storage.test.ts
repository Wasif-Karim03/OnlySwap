import { createMMKV } from 'react-native-mmkv';

import {
  createTypedStorage,
  runMigrations,
  secureSessionStorage,
  STORAGE_VERSION,
  type Migration,
} from '../src/lib/storage';

// expo-secure-store is mocked in memory by jest.setup.ts.

describe('T-UNIT-LIB-08 lib/storage', () => {
  it('stores and reads typed values', () => {
    const s = createTypedStorage(createMMKV({ id: 'typed' }));
    expect(s.get('theme.mode')).toBeUndefined();
    s.set('theme.mode', 'dark');
    s.set('privacy.analyticsOptOut', true);
    expect(s.get('theme.mode')).toBe('dark');
    expect(s.get('privacy.analyticsOptOut')).toBe(true);
    s.remove('theme.mode');
    expect(s.get('theme.mode')).toBeUndefined();
  });

  it('drops a corrupt value instead of crashing', () => {
    const mmkv = createMMKV({ id: 'corrupt' });
    mmkv.set('theme.mode', '{not json');
    expect(createTypedStorage(mmkv).get('theme.mode')).toBeUndefined();
    expect(mmkv.contains('theme.mode')).toBe(false);
  });

  it('stamps a fresh store with the current version', () => {
    const mmkv = createMMKV({ id: 'fresh' });
    expect(runMigrations(mmkv)).toBe(STORAGE_VERSION);
    expect(mmkv.getNumber('__storage_version')).toBe(STORAGE_VERSION);
  });

  it('migrates v1 keys in order and only once', () => {
    const mmkv = createMMKV({ id: 'legacy' });
    mmkv.set('__storage_version', 1);
    mmkv.set('darkMode', 'true');
    const run = jest.fn((store: typeof mmkv) => {
      if (store.getString('darkMode') === 'true') store.set('theme.mode', JSON.stringify('dark'));
      store.remove('darkMode');
    });
    const migrations: Migration[] = [{ from: 1, run }];
    expect(runMigrations(mmkv, migrations, 2)).toBe(2);
    expect(runMigrations(mmkv, migrations, 2)).toBe(2);
    expect(run).toHaveBeenCalledTimes(1);
    expect(createTypedStorage(mmkv).get('theme.mode')).toBe('dark');
    expect(mmkv.contains('darkMode')).toBe(false);
  });

  it('fails loudly when a migration step is missing', () => {
    const mmkv = createMMKV({ id: 'gap' });
    mmkv.set('__storage_version', 3);
    expect(() => runMigrations(mmkv, [], 4)).toThrow('no migration from v3');
  });
});

describe('secureSessionStorage (session in SecureStore, SECURITY §5)', () => {
  it('round-trips a session larger than one SecureStore value', async () => {
    const session = JSON.stringify({ access_token: 'a'.repeat(4000), refresh_token: 'r' });
    await secureSessionStorage.setItem('sb-session', session);
    await expect(secureSessionStorage.getItem('sb-session')).resolves.toBe(session);
  });

  it('removes every chunk', async () => {
    const mocked = jest.requireMock('expo-secure-store') as { __store: Map<string, string> };
    await secureSessionStorage.setItem('sb-x', 'b'.repeat(5000));
    await secureSessionStorage.removeItem('sb-x');
    expect([...mocked.__store.keys()].filter((k) => k.startsWith('sb-x'))).toEqual([]);
    await expect(secureSessionStorage.getItem('sb-x')).resolves.toBeNull();
  });
});
