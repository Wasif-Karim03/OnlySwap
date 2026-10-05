/** @type {import('react-native-unistyles/plugin').UnistylesPluginOptions} */
const unistyles = { root: 'src' };

/**
 * Web app (P13-WEB-07): on web, Unistyles turns styles into CSS classes only
 * inside components it processes. These third-party components receive our
 * Unistyles styles (root GestureHandlerRootView, expo-image, FlashList), so
 * their `react-native` imports are swapped for Unistyles' components in the
 * web bundle. iOS and Android keep the plain config (native shadow tree).
 */
const WEB_PROCESS_PATHS = [
  'react-native-gesture-handler/lib/module/components',
  'expo-image/build',
  '@shopify/flash-list/dist',
];

module.exports = function (api) {
  // Cached per caller platform (Metro passes ios / android / web).
  const platform = api.caller((caller) => caller && caller.platform);
  return {
    presets: ['babel-preset-expo'],
    // Unistyles must run before the React Compiler that babel-preset-expo adds.
    plugins: [
      [
        'react-native-unistyles/plugin',
        platform === 'web' ? { ...unistyles, autoProcessPaths: WEB_PROCESS_PATHS } : unistyles,
      ],
    ],
  };
};
