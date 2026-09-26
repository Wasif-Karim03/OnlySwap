import { StyleSheet } from 'react-native-unistyles';

import { readStoredMode, startupSettings } from './mode';
import { darkTheme, lightTheme } from './themes';

const appThemes = { light: lightTheme, dark: darkTheme };

type AppThemes = typeof appThemes;

declare module 'react-native-unistyles' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface UnistylesThemes extends AppThemes {}
}

StyleSheet.configure({
  themes: appThemes,
  settings: startupSettings(readStoredMode()),
});
