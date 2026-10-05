// Unistyles must be configured before any StyleSheet is created (Unistyles
// Expo Router guide), and expo-router/entry loads every route module, so the
// theme import has to come first.
import './src/theme/unistyles';
import 'expo-router/entry';

import { Platform } from 'react-native';

// Android home screen widget (P17-FEAT-01): the launcher wakes this headless
// task to draw it. iOS widgets run in their own extension instead.
if (Platform.OS === 'android') {
  /* eslint-disable @typescript-eslint/no-require-imports -- Android-only native module */
  const { registerWidgetTaskHandler } =
    require('react-native-android-widget') as typeof import('react-native-android-widget');
  const { androidWidgetTaskHandler } =
    require('./src/features/widgets/androidTask') as typeof import('./src/features/widgets/androidTask');
  /* eslint-enable @typescript-eslint/no-require-imports */
  registerWidgetTaskHandler(androidWidgetTaskHandler);
}
