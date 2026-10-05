// Metro with Sentry's debug IDs so crash stack traces map to source (P14-MON-01).
// Otherwise the same as Expo's default config.
const path = require('path');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

/**
 * Web app (P13-WEB-07): packages with no browser build are swapped for small
 * web stand-ins in the web bundle only. iOS and Android resolve as before.
 * Our own modules use `*.web.ts(x)` files instead (Metro picks them by platform).
 */
const WEB_SHIMS = {
  'react-native-keyboard-controller': path.resolve(
    __dirname,
    'src/shims/keyboardController.web.tsx',
  ),
};

const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_SHIMS[moduleName]) {
    return { type: 'sourceFile', filePath: WEB_SHIMS[moduleName] };
  }
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
