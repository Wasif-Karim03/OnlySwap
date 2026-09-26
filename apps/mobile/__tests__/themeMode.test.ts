import { UnistylesRuntime } from 'react-native-unistyles';

import { getStorage } from '../src/lib/storage';
import { applyMode, readStoredMode, startupSettings, useThemeModeStore } from '../src/theme/mode';
import { darkTheme, lightTheme } from '../src/theme/themes';

describe('P2-TOK-03 theme mode (System / Light / Dark)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    getStorage().remove('theme.mode');
  });

  it('starts adaptive for System and on a fixed theme otherwise, before first render', () => {
    expect(startupSettings('system')).toEqual({ adaptiveThemes: true });
    expect(startupSettings('light')).toEqual({ initialTheme: 'light' });
    expect(startupSettings('dark')).toEqual({ initialTheme: 'dark' });
  });

  it('defaults to System and ignores junk in storage', () => {
    expect(readStoredMode()).toBe('system');
    getStorage().set('theme.mode', 'sepia' as never);
    expect(readStoredMode()).toBe('system');
  });

  it('switches Unistyles synchronously', () => {
    const adaptive = jest.spyOn(UnistylesRuntime, 'setAdaptiveThemes').mockImplementation(() => {});
    const setTheme = jest.spyOn(UnistylesRuntime, 'setTheme').mockImplementation(() => {});
    applyMode('dark');
    expect(adaptive).toHaveBeenLastCalledWith(false);
    expect(setTheme).toHaveBeenLastCalledWith('dark');
    applyMode('system');
    expect(adaptive).toHaveBeenLastCalledWith(true);
  });

  it('persists the choice in MMKV', () => {
    jest.spyOn(UnistylesRuntime, 'setAdaptiveThemes').mockImplementation(() => {});
    jest.spyOn(UnistylesRuntime, 'setTheme').mockImplementation(() => {});
    useThemeModeStore.getState().setMode('light');
    expect(useThemeModeStore.getState().mode).toBe('light');
    expect(getStorage().get('theme.mode')).toBe('light');
    expect(readStoredMode()).toBe('light');
  });

  it('builds light and dark themes from the tokens with one accent', () => {
    expect(lightTheme.colors.bg).toBe('#FFFFFF');
    expect(darkTheme.colors.bg).toBe('#0C0C0D');
    expect(lightTheme.colors.accent).toBe(darkTheme.colors.accent);
    expect(Object.keys(lightTheme.colors).sort()).toEqual(Object.keys(darkTheme.colors).sort());
  });
});
