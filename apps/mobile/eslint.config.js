// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['dist/*', '.expo/*', 'ios/*', 'android/*', 'coverage/*', 'expo-env.d.ts'],
  },
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'import/no-default-export': 'off',
    },
  },
]);
