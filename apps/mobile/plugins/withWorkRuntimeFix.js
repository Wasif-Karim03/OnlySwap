// Android: two copies of the WorkManager Kotlin helpers clashed in the first
// R2 build (checkDebugDuplicateClasses): work-runtime 2.8.1 already contains
// what work-runtime-ktx 2.7.1 (pulled in by a widget dependency) adds. Pinning
// the -ktx artifact to the same 2.8.1 makes it an empty shim, so one copy wins.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// onlyswap: work-runtime-ktx pin';
const WORK_VERSION = '2.8.1';
const SNIPPET = `
${MARKER}
configurations.all {
    resolutionStrategy {
        force 'androidx.work:work-runtime:${WORK_VERSION}'
        force 'androidx.work:work-runtime-ktx:${WORK_VERSION}'
    }
}
`;

function withWorkRuntimeFix(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += SNIPPET;
    }
    return cfg;
  });
}

module.exports = withWorkRuntimeFix;
module.exports.WORK_VERSION = WORK_VERSION;
