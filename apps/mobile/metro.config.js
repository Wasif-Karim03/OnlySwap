// Metro with Sentry's debug IDs so crash stack traces map to source (P14-MON-01).
// Otherwise the same as Expo's default config.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
