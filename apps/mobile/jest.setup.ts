// Test-only public config so modules that validate env at import time load.
process.env.EXPO_PUBLIC_APP_ENV = 'local';
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_test_only_not_a_real_key';
process.env.EXPO_PUBLIC_MEDIA_URL = 'http://127.0.0.1:8787';
process.env.EXPO_PUBLIC_SITE_URL = 'https://onlyswap.pages.dev';

// Nitro native modules don't exist under Jest; MMKV falls back to its
// built-in in-memory mock once the import itself succeeds.
jest.mock('react-native-nitro-modules', () => ({
  NitroModules: { createHybridObject: jest.fn() },
}));

// Unistyles and keyboard-controller ship Jest mocks for their native parts.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('react-native-unistyles/mocks');
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./src/theme/unistyles');
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock.js'),
);
