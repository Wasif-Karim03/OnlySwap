// Strips dev-only Info.plist keys from release builds (APP_VARIANT preview or production).
// expo-dev-client adds the local-network keys for the dev launcher, which is
// compiled only into Debug; release builds must ask for camera and photos only
// (TESTING §7).
const { withInfoPlist } = require('expo/config-plugins');

const DEV_ONLY_INFO_PLIST_KEYS = ['NSLocalNetworkUsageDescription', 'NSBonjourServices'];

function withReleaseHardening(config, { variant } = {}) {
  if (!variant || variant === 'development') return config;
  return withInfoPlist(config, (cfg) => {
    for (const key of DEV_ONLY_INFO_PLIST_KEYS) delete cfg.modResults[key];
    return cfg;
  });
}

module.exports = withReleaseHardening;
module.exports.DEV_ONLY_INFO_PLIST_KEYS = DEV_ONLY_INFO_PLIST_KEYS;
