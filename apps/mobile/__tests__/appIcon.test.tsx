import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { existsSync } from 'fs';
import { join } from 'path';
import type { ExpoConfig } from 'expo/config';

import buildConfig, { ALT_APP_ICONS, WIDGET_APP_GROUP, WIDGET_NAME } from '../app.config';
import { AppIconPicker, LiveActivityToggle } from '../src/features/appIcon/AppearanceExtras';
import {
  APP_ICONS,
  choiceFromNative,
  NATIVE_ICON_NAMES,
  nativeIconName,
} from '../src/features/appIcon/logic';
import { useToastStore } from '../src/components/Toast';
import { ANDROID_WIDGET } from '../src/features/widgets/AndroidNextMeetup';
import { NEXT_MEETUP_WIDGET } from '../src/features/widgets/NextMeetupWidget';
import { settings } from '../src/strings/en';

jest.mock('expo-alternate-app-icons', () => ({
  supportsAlternateIcons: true,
  getAppIconName: jest.fn(() => null),
  setAlternateAppIcon: jest.fn(async (name: string | null) => name),
}));
jest.mock('expo-widgets', () => ({
  createWidget: jest.fn(() => ({})),
  createLiveActivity: jest.fn(() => ({})),
}));
jest.mock('@expo/ui/swift-ui', () => ({}));
jest.mock('@expo/ui/swift-ui/modifiers', () => ({}));
jest.mock('react-native-android-widget', () => ({ FlexWidget: 'F', TextWidget: 'T' }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const icons = require('expo-alternate-app-icons') as {
  getAppIconName: jest.Mock;
  setAlternateAppIcon: jest.Mock;
};

function memStore(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    data,
    get: ((k: string) => data.get(k)) as never,
    set: ((k: string, v: unknown) => void data.set(k, v)) as never,
  };
}

type PluginEntry = string | [string, unknown];
function plugin(cfg: ExpoConfig, name: string): unknown {
  const e = (cfg.plugins as PluginEntry[]).find((p) => (Array.isArray(p) ? p[0] : p) === name);
  return Array.isArray(e) ? e[1] : e;
}

describe('T-UNIT-ICON-01 app icon choice (R2-ICON-01)', () => {
  it('maps picker choices to native names and back', () => {
    expect(APP_ICONS).toEqual(['default', 'night', 'paper', 'mono']);
    expect(nativeIconName('default')).toBeNull();
    expect(nativeIconName('night')).toBe('Night');
    expect(choiceFromNative('Mono')).toBe('mono');
    expect(choiceFromNative(null)).toBe('default');
    expect(choiceFromNative('Removed')).toBe('default');
  });

  it('the picker calls the native module and saves the choice', async () => {
    const store = memStore();
    render(<AppIconPicker store={store} />);
    expect(screen.getByLabelText(settings.appIcons.default).props.accessibilityState).toMatchObject(
      { checked: true },
    );
    fireEvent.press(screen.getByLabelText(settings.appIcons.night));
    await waitFor(() => expect(store.data.get('settings.appIcon')).toBe('night'));
    expect(icons.setAlternateAppIcon).toHaveBeenCalledWith('Night');
    fireEvent.press(screen.getByLabelText(settings.appIcons.default));
    await waitFor(() => expect(icons.setAlternateAppIcon).toHaveBeenLastCalledWith(null));
  });

  it('reads the current icon from the OS and reverts on failure', async () => {
    icons.getAppIconName.mockReturnValueOnce('Paper');
    icons.setAlternateAppIcon.mockRejectedValueOnce(new Error('nope'));
    const store = memStore();
    render(<AppIconPicker store={store} os="android" />);
    expect(screen.getByText(settings.appIconAndroid)).toBeTruthy();
    expect(screen.getByLabelText(settings.appIcons.paper).props.accessibilityState).toMatchObject({
      checked: true,
    });
    fireEvent.press(screen.getByLabelText(settings.appIcons.mono));
    await waitFor(() =>
      expect(useToastStore.getState().current?.message).toBe(settings.appIconFailed),
    );
    expect(screen.getByLabelText(settings.appIcons.paper).props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(store.data.has('settings.appIcon')).toBe(false);
  });

  it('hides when the device has no alternate icons', () => {
    render(
      <AppIconPicker
        api={{ supported: () => false, current: () => null, set: jest.fn() }}
        store={memStore()}
      />,
    );
    expect(screen.queryByTestId('app-icon-picker')).toBeNull();
  });
});

describe('T-UNIT-WIDGET-05 Lock Screen setting (P17-FEAT-01)', () => {
  it('saves the switch and re-syncs (iOS)', () => {
    const store = memStore();
    const onChanged = jest.fn();
    render(<LiveActivityToggle os="ios" store={store} onChanged={onChanged} />);
    const sw = screen.getByRole('switch', { name: settings.liveActivities });
    expect(sw.props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(sw);
    expect(store.data.get('settings.liveActivities')).toBe(false);
    expect(onChanged).toHaveBeenCalled();
  });

  it('is not shown on Android', () => {
    render(<LiveActivityToggle os="android" store={memStore()} onChanged={jest.fn()} />);
    expect(screen.queryByText(settings.liveActivities)).toBeNull();
  });
});

describe('T-STORE app.config.ts widget and icon plugins (P17-FEAT-01, R2-ICON-01)', () => {
  const cfg = buildConfig({ config: {}, projectRoot: __dirname } as never);

  it('configures the iOS widget extension with an App Group and no Live Activity push', () => {
    const opts = plugin(cfg, 'expo-widgets') as {
      groupIdentifier: string;
      enablePushNotifications: boolean;
      widgets: { name: string; ios: { supportedFamilies: string[] } }[];
    };
    expect(opts.groupIdentifier).toBe('group.app.onlyswap');
    expect(WIDGET_APP_GROUP).toBe('group.app.onlyswap');
    expect(opts.enablePushNotifications).toBe(false);
    expect(opts.widgets.map((w) => w.name)).toEqual([WIDGET_NAME]);
    expect(opts.widgets[0]!.ios.supportedFamilies).toEqual(['systemSmall', 'systemMedium']);
  });

  it('names match the code', () => {
    expect(NEXT_MEETUP_WIDGET).toBe(WIDGET_NAME);
    expect(ANDROID_WIDGET).toBe(WIDGET_NAME);
    expect(ALT_APP_ICONS.map((i) => i.name)).toEqual(Object.values(NATIVE_ICON_NAMES));
  });

  it('adds the Android widget with a 30 min refresh', () => {
    const opts = plugin(cfg, 'react-native-android-widget') as {
      widgets: { name: string; updatePeriodMillis: number }[];
    };
    expect(opts.widgets).toEqual([
      expect.objectContaining({ name: WIDGET_NAME, updatePeriodMillis: 1_800_000 }),
    ]);
  });

  it('adds the alternate icons for both OSes, and the image files exist', () => {
    const opts = plugin(cfg, 'expo-alternate-app-icons') as {
      name: string;
      ios: string;
      android: { foregroundImage: string; backgroundColor: string };
    }[];
    expect(opts.map((o) => o.name)).toEqual(['Night', 'Paper', 'Mono']);
    for (const o of opts) {
      expect(existsSync(join(__dirname, '..', o.ios))).toBe(true);
      expect(existsSync(join(__dirname, '..', o.android.foregroundImage))).toBe(true);
      expect(o.android.backgroundColor).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('asks for no new permissions (no location)', () => {
    expect(JSON.stringify(cfg)).not.toMatch(/NSLocation/);
    expect(cfg.android?.blockedPermissions).toContain('android.permission.ACCESS_FINE_LOCATION');
  });
});
