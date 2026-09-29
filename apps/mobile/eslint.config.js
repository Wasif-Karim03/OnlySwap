// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');
const a11y = require('eslint-plugin-react-native-a11y');

// CLAUDE.md rule 10 / P1-CI-02: the plugin's `all` preset (iOS + Android rules), as errors.
// Hints stay optional (Apple HIG / Android guidance): requiring one on every
// labelled element forced meaningless hints on images and plain text.
const a11yRules = {
  ...a11y.configs.all.rules,
  'react-native-a11y/has-accessibility-hint': 'off',
};

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: [
      'dist/*',
      '.expo/*',
      'ios/*',
      'android/*',
      'coverage/*',
      'expo-env.d.ts',
      '.maestro/*',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-native-a11y': a11y },
    rules: a11yRules,
  },
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
]);
