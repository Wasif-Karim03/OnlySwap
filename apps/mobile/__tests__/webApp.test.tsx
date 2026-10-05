import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Platform, Text } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

import buildConfig from '../app.config';
import { WebDateInput, isoDay, parseIsoDay } from '../src/components/WebDateInput';
import { AppIconPicker, LiveActivityToggle } from '../src/features/appIcon/AppearanceExtras';
import { computeGate, type AppConfig, type GateInput } from '../src/features/auth/logic';
import type { FeedApi } from '../src/features/feed/api';
import { DiscoverScreen } from '../src/features/feed/DiscoverScreen';
import type { FeedItem, ListingResult } from '../src/features/feed/logic';
import { createSwipeStore } from '../src/features/feed/swipes';
import {
  MAX_ZOOM as WEB_MAX_ZOOM,
  SpotsMap as WebSpotsMap,
} from '../src/features/meetups/SpotsMap.web';
import { PhotoGrid } from '../src/features/sell/PhotoGrid';
import { enterSends, isWebPlatform, supportsFeature, WEB_HIDDEN } from '../src/lib/platform';
import * as webStorage from '../src/lib/storage.web';
import { titleForPath } from '../src/lib/webTitle';
import * as keyboardShim from '../src/shims/keyboardController.web';
import { sell, web } from '../src/strings/en';

// The native modules, required by path: ESLint's resolver would read these
// imports as the `.web` files (it prefers web extensions).
const nativeStorage = jest.requireActual<typeof import('../src/lib/storage')>('../src/lib/storage');
const NATIVE_MAX_ZOOM = jest.requireActual<typeof import('../src/features/meetups/SpotsMap')>(
  '../src/features/meetups/SpotsMap',
).MAX_ZOOM;

jest.mock('expo-alternate-app-icons', () => ({
  supportsAlternateIcons: true,
  getAppIconName: jest.fn(() => null),
  setAlternateAppIcon: jest.fn(async () => null),
}));
jest.mock('expo-widgets', () => ({
  createWidget: jest.fn(() => ({})),
  createLiveActivity: jest.fn(() => ({})),
}));
jest.mock('@expo/ui/swift-ui', () => ({}));
jest.mock('@expo/ui/swift-ui/modifiers', () => ({}));
jest.mock('react-native-android-widget', () => ({ FlexWidget: 'F', TextWidget: 'T' }));

/** A Web Storage stand-in (the browser's localStorage) shared with other origins' keys. */
function fakeLocalStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

function memStore() {
  const data = new Map<string, unknown>();
  return {
    get: ((k: string) => data.get(k)) as never,
    set: ((k: string, v: unknown) => void data.set(k, v)) as never,
  };
}

describe('T-UNIT-WEB-01 web storage shim (storage.web.ts, P13-WEB-07)', () => {
  it('exports the same API as the native storage module', () => {
    const nativeKeys = Object.keys(nativeStorage)
      // The MMKV key only exists because native storage is encrypted.
      .filter((k) => k !== 'getOrCreateEncryptionKey')
      .sort();
    for (const key of nativeKeys) {
      expect(typeof (webStorage as Record<string, unknown>)[key]).toBe(
        typeof (nativeStorage as Record<string, unknown>)[key],
      );
    }
    expect(webStorage.STORAGE_VERSION).toBe(nativeStorage.STORAGE_VERSION);
  });

  it('the web KV behaves like MMKV for every call storage makes', () => {
    const mmkv = createMMKV({ id: 'parity' });
    const kv = webStorage.createWebKV(fakeLocalStorage());
    for (const store of [mmkv, kv]) {
      expect(store.getString('a')).toBeUndefined();
      expect(store.getNumber('n')).toBeUndefined();
      store.set('a', 'x');
      store.set('n', 3);
      expect(store.getString('a')).toBe('x');
      expect(store.getNumber('n')).toBe(3);
      store.remove('a');
      expect(store.getString('a')).toBeUndefined();
    }
  });

  it('typed get/set, corrupt values and migrations work over localStorage', () => {
    const ls = fakeLocalStorage();
    const kv = webStorage.createWebKV(ls);
    expect(webStorage.runMigrations(kv)).toBe(webStorage.STORAGE_VERSION);
    expect(ls.getItem(`${webStorage.WEB_PREFIX}__storage_version`)).toBe(
      String(webStorage.STORAGE_VERSION),
    );
    const s = webStorage.createTypedStorage(kv);
    s.set('theme.mode', 'dark');
    s.set('privacy.analyticsOptOut', true);
    expect(s.get('theme.mode')).toBe('dark');
    expect(s.get('privacy.analyticsOptOut')).toBe(true);
    ls.setItem(`${webStorage.WEB_PREFIX}search.recent`, '{not json');
    expect(s.get('search.recent')).toBeUndefined();
    expect(ls.getItem(`${webStorage.WEB_PREFIX}search.recent`)).toBeNull();
  });

  it('clearAll only removes OnlySwap keys and keeps the version stamp', () => {
    const ls = fakeLocalStorage({ 'other-app': 'keep' });
    const s = webStorage.createTypedStorage(webStorage.createWebKV(ls));
    s.set('theme.mode', 'light');
    s.clearAll();
    expect(ls.getItem('other-app')).toBe('keep');
    expect(s.get('theme.mode')).toBeUndefined();
    expect(ls.getItem(`${webStorage.WEB_PREFIX}__storage_version`)).toBe(
      String(webStorage.STORAGE_VERSION),
    );
  });

  it('falls back to memory when localStorage is missing or blocked', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    try {
      const backing = webStorage.browserStorage();
      backing.setItem('k', 'v');
      expect(webStorage.browserStorage().getItem('k')).toBe('v');
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it('keeps the Supabase session in browser storage (supabase-js web behaviour)', async () => {
    const key = 'sb-test-auth-token';
    const session = JSON.stringify({ access_token: 'a'.repeat(4000), refresh_token: 'r' });
    await webStorage.secureSessionStorage.setItem(key, session);
    await expect(webStorage.secureSessionStorage.getItem(key)).resolves.toBe(session);
    await webStorage.secureSessionStorage.removeItem(key);
    await expect(webStorage.secureSessionStorage.getItem(key)).resolves.toBeNull();
  });
});

describe('T-UNIT-WEB-02 platform guards hide phone-only features on web', () => {
  it('isWebPlatform and supportsFeature follow the OS', () => {
    expect(isWebPlatform('web')).toBe(true);
    expect(isWebPlatform('ios')).toBe(false);
    expect(isWebPlatform()).toBe(Platform.OS === 'web');
    for (const f of WEB_HIDDEN) {
      expect(supportsFeature(f, 'web')).toBe(false);
      expect(supportsFeature(f, 'ios')).toBe(true);
      expect(supportsFeature(f, 'android')).toBe(true);
    }
    expect(WEB_HIDDEN).toEqual(
      expect.arrayContaining(['push', 'app-icon', 'live-activities', 'widgets', 'camera']),
    );
  });

  it('Settings > Appearance hides the app icon picker and Live Activity switch on web', () => {
    const { toJSON } = render(
      <>
        <AppIconPicker os="web" store={memStore()} />
        <LiveActivityToggle os="web" store={memStore()} onChanged={jest.fn()} />
      </>,
    );
    expect(toJSON()).toBeNull();
    expect(screen.queryByTestId('app-icon-picker')).toBeNull();
  });

  it('the native picker still shows (unchanged phone behaviour)', () => {
    render(<AppIconPicker os="ios" store={memStore()} />);
    expect(screen.getByTestId('app-icon-picker')).toBeTruthy();
  });

  it('Sell photos: no camera tile when the screen passes no camera (web)', () => {
    const props = {
      photos: [],
      progress: {},
      sourceOf: () => '',
      onLibrary: jest.fn(),
      onRemove: jest.fn(),
      onRetry: jest.fn(),
      onMove: jest.fn(),
    };
    const { rerender } = render(<PhotoGrid {...props} />);
    expect(screen.queryByTestId('sell-add-camera')).toBeNull();
    expect(screen.getByLabelText(sell.library)).toBeTruthy();
    rerender(<PhotoGrid {...props} onCamera={jest.fn()} />);
    expect(screen.getByTestId('sell-add-camera')).toBeTruthy();
  });

  it('the web spots map renders nothing and keeps the native constants', () => {
    const { toJSON } = render(
      <WebSpotsMap spots={[{ id: 's', name: 'Library', lat: 1, lng: 1, police: false }]} />,
    );
    expect(toJSON()).toBeNull();
    expect(WEB_MAX_ZOOM).toBe(NATIVE_MAX_ZOOM);
  });

  it('Enter sends in the web chat composer, Shift+Enter and phones do not', () => {
    const key = (k: string, extra: Record<string, boolean> = {}) => ({
      nativeEvent: { key: k, ...extra },
    });
    expect(enterSends(key('Enter'), 'web')).toBe(true);
    expect(enterSends(key('Enter', { shiftKey: true }), 'web')).toBe(false);
    expect(enterSends(key('Enter', { isComposing: true }), 'web')).toBe(false);
    expect(enterSends(key('a'), 'web')).toBe(false);
    expect(enterSends(key('Enter'), 'ios')).toBe(false);
    expect(enterSends(key('Enter'), 'android')).toBe(false);
  });
});

describe('T-UNIT-WEB-03 launch gate on web', () => {
  const config: AppConfig = {
    maintenance: { enabled: false, until: null },
    minVersionIos: '9.0.0',
    minVersionAndroid: '9.0.0',
    rulesVersion: '2026-10',
    rulesChanges: [],
  } as unknown as AppConfig;
  const base: GateInput = {
    config,
    appVersion: '0',
    platform: 'web',
    session: 'signedIn',
    profile: {
      status: 'active',
      firstName: 'Sam',
      adultConfirmed: true,
      rulesVersion: '2026-10',
    },
    notificationsAsked: false,
  };

  it('never asks a browser to update or to allow push', () => {
    expect(computeGate(base)).toBe('home');
    expect(computeGate({ ...base, session: 'signedOut' })).toBe('welcome');
  });

  it('phones keep the version check and the push primer', () => {
    expect(computeGate({ ...base, platform: 'ios' })).toBe('update');
    expect(computeGate({ ...base, platform: 'ios', appVersion: '9.0.0' })).toBe('notifications');
  });

  it('maintenance still applies on web', () => {
    expect(
      computeGate({ ...base, config: { ...config, maintenance: { enabled: true, until: null } } }),
    ).toBe('maintenance');
  });
});

describe('T-UNIT-WEB-04 page titles per route', () => {
  it('names each W08 page', () => {
    const t = (k: keyof typeof web.titles) => `${web.titles[k]} | ${web.appName}`;
    expect(titleForPath('/welcome')).toBe(t('signIn'));
    expect(titleForPath('/email?mode=login')).toBe(t('signIn'));
    expect(titleForPath('/discover')).toBe(t('discover'));
    expect(titleForPath('/search/results')).toBe(t('search'));
    expect(titleForPath('/listing/abc')).toBe(t('listing'));
    expect(titleForPath('/listing/abc/offer')).toBe(t('offer'));
    expect(titleForPath('/inbox')).toBe(t('inbox'));
    expect(titleForPath('/chat/abc')).toBe(t('chat'));
    expect(titleForPath('/sell/details')).toBe(t('sell'));
    expect(titleForPath('/settings/privacy')).toBe(t('settings'));
    expect(titleForPath('/')).toBe(web.appName);
    expect(titleForPath('/maintenance')).toBe(web.appName);
  });
});

describe('T-UNIT-WEB-05 web stand-ins', () => {
  it('keyboard-controller shim renders plain views and a closed keyboard', () => {
    const { KeyboardProvider, KeyboardAwareScrollView, KeyboardStickyView, KeyboardAvoidingView } =
      keyboardShim;
    render(
      <KeyboardProvider>
        <KeyboardAvoidingView behavior="padding">
          <KeyboardAwareScrollView bottomOffset={96} testID="scroll">
            <Text>inside</Text>
          </KeyboardAwareScrollView>
          <KeyboardStickyView offset={{ closed: 0, opened: 10 }} testID="dock" />
        </KeyboardAvoidingView>
      </KeyboardProvider>,
    );
    expect(screen.getByText('inside')).toBeTruthy();
    expect(screen.getByTestId('scroll').props.bottomOffset).toBeUndefined();
    expect(screen.getByTestId('dock').props.offset).toBeUndefined();
    const { result } = renderHook(() => keyboardShim.useKeyboardState((s) => s.isVisible));
    expect(result.current).toBe(false);
    expect(keyboardShim.useKeyboardState()).toMatchObject({ isVisible: false, height: 0 });
  });

  it('metro swaps keyboard-controller for the shim on web only', () => {
    const src = readFileSync(join(__dirname, '..', 'metro.config.js'), 'utf8');
    expect(src).toContain("'react-native-keyboard-controller'");
    expect(src).toContain('src/shims/keyboardController.web.tsx');
    expect(src).toMatch(/platform === 'web'/);
  });

  it('web date field: ISO day helpers round-trip and reject impossible dates', () => {
    const d = new Date(2005, 1, 3);
    expect(isoDay(d)).toBe('2005-02-03');
    expect(parseIsoDay('2005-02-03')?.getTime()).toBe(d.getTime());
    expect(parseIsoDay('2005-02-30')).toBeNull();
    expect(parseIsoDay('')).toBeNull();
    expect(typeof WebDateInput).toBe('function');
  });
});

describe('T-UNIT-WEB-06 web build config and hosting files', () => {
  it('app config exports web as a single-page app', () => {
    const cfg = buildConfig({ config: {} } as never);
    expect(cfg.platforms).toEqual(['ios', 'android', 'web']);
    expect(cfg.web).toMatchObject({ bundler: 'metro', output: 'single' });
  });

  it('_headers sets CSP, frame denial, referrer and permissions policies', () => {
    const headers = readFileSync(join(__dirname, '..', 'public', '_headers'), 'utf8');
    expect(headers).toMatch(/Content-Security-Policy: default-src 'self'; script-src 'self';/);
    expect(headers).toMatch(
      /connect-src [^\n]*https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co/,
    );
    expect(headers).toMatch(/frame-ancestors 'none'/);
    expect(headers).toContain('X-Frame-Options: DENY');
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(headers).toMatch(/Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\)/);
    expect(headers).not.toMatch(/unsafe-eval/);
  });

  it('_redirects never adds the looping SPA rule (Pages serves index.html itself)', () => {
    const redirects = readFileSync(join(__dirname, '..', 'public', '_redirects'), 'utf8');
    const rules = redirects
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    expect(rules).not.toContain('/* /index.html 200');
    expect(rules).toContain('/l/:id /listing/:id 302');
  });

  it('the page template keeps keyboard focus visible', () => {
    const html = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf8');
    expect(html).toContain(':focus-visible');
    expect(html).toContain('<div id="root"></div>');
  });
});

// ---------------------------------------------------------------------------
// Discover browses as a grid on web at any width (W08)

const NOW = new Date('2027-03-10T12:00:00Z');

function item(n: number): FeedItem {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    kind: 'sale',
    status: 'active',
    title: `Item ${n}`,
    description: null,
    price_cents: 1000,
    condition: 'good',
    category_id: 1,
    open_to_offers: true,
    meet_spot_ids: [],
    meet_note: null,
    availability: [],
    save_count: 0,
    view_count: 0,
    offer_count: 0,
    bumped_at: NOW.toISOString(),
    created_at: NOW.toISOString(),
    expires_at: null,
    is_own: false,
    saved: false,
    watching: false,
    seller: { id: 's', display_name: 'Aisha A.', avatar_path: null, year: null, created_at: null },
    photos: [],
  };
}

function fakeApi(page: FeedItem[]): FeedApi {
  return {
    getFeed: jest.fn(async (c) => (c ? [] : page)),
    recordSwipes: jest.fn(async () => {}),
    undoSwipe: jest.fn(async () => {}),
    save: jest.fn(async () => 1),
    unsave: jest.fn(async () => 0),
    hide: jest.fn(async () => {}),
    watch: jest.fn(async () => {}),
    recordView: jest.fn(async () => {}),
    getListing: jest.fn(async () => ({ id: 'x', access: 'gone' }) as ListingResult),
    reportListing: jest.fn(async () => {}),
  };
}

describe('T-UNIT-WEB-07 Discover is a grid on web (W-BROWSE)', () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });
  afterEach(() => jest.restoreAllMocks());

  const show = () => {
    const page = [item(1), item(2), item(3)];
    const api = fakeApi(page);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    renderRouter(
      {
        discover: () => (
          <DiscoverScreen
            api={api}
            swipes={createSwipeStore({ get: () => undefined, set: () => {} }, api, () => NOW)}
            coach={{ seen: () => true, markSeen: jest.fn() }}
            mediaBase={() => 'http://m'}
            now={() => NOW}
          />
        ),
      },
      { initialUrl: '/discover', wrapper },
    );
    return page;
  };

  it('a phone-width browser window gets tiles with Skip, Save and Offer', async () => {
    const restore = jest.replaceProperty(Platform, 'OS', 'web');
    try {
      const page = show();
      expect(await screen.findByTestId(`deck-tile-${page[0]!.id}`)).toBeTruthy();
      expect(
        screen.getByTestId(`deck-item-${page[0]!.id}-offer`, { includeHiddenElements: true }),
      ).toBeTruthy();
    } finally {
      restore.restore();
    }
  });

  it('a phone keeps the swipe deck', async () => {
    const page = show();
    expect(await screen.findByTestId(`deck-card-${page[0]!.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`deck-tile-${page[0]!.id}`)).toBeNull();
  });
});
