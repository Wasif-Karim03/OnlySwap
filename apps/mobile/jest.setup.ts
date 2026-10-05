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

// Gesture handler, Unistyles and keyboard-controller ship Jest mocks for their native parts.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('react-native-gesture-handler/jestSetup');
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('react-native-unistyles/mocks');
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);
// In-memory SecureStore so storage and session code run under Jest.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
    __store: store,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    getItemAsync: async (k: string) => store.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void store.set(k, v),
    deleteItemAsync: async (k: string) => void store.delete(k),
  };
});

// Reanimated 4 + worklets run their JS mocks under Jest.
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated/mock'),
  useReducedMotion: () => false,
}));

// MapLibre is a native view; under Jest each component is a plain View that
// keeps its props, so tests can read the camera and fire map/marker events.
jest.mock('@maplibre/maplibre-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');
  const host = (name: string) => {
    const C = (props: Record<string, unknown>) => createElement(View, props);
    C.displayName = name;
    return C;
  };
  return {
    Map: host('MapLibreMap'),
    Camera: host('MapLibreCamera'),
    Marker: host('MapLibreMarker'),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./src/theme/unistyles');
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock.js'),
);
