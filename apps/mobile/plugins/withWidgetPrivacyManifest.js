// AR-06: the iOS widget extension (expo-widgets) is its own bundle, so it
// needs its own PrivacyInfo.xcprivacy. It reads the App Group's UserDefaults
// (1C8F.1). expo-widgets makes the target with no Resources phase, so this
// adds one with the manifest in it. Listed BEFORE expo-widgets in app.config.ts
// (mods run in reverse order);
// scripts/verify/check-prebuild.mjs fails if the file or the phase is missing.
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const TARGET = 'ExpoWidgetsTarget';
const FILE = 'PrivacyInfo.xcprivacy';

const MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSPrivacyAccessedAPITypes</key>
	<array>
		<dict>
			<key>NSPrivacyAccessedAPIType</key>
			<string>NSPrivacyAccessedAPICategoryUserDefaults</string>
			<key>NSPrivacyAccessedAPITypeReasons</key>
			<array>
				<string>1C8F.1</string>
				<string>CA92.1</string>
			</array>
		</dict>
	</array>
	<key>NSPrivacyCollectedDataTypes</key>
	<array/>
	<key>NSPrivacyTracking</key>
	<false/>
	<key>NSPrivacyTrackingDomains</key>
	<array/>
</dict>
</plist>
`;

function withWidgetPrivacyManifest(config) {
  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, TARGET);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, FILE), MANIFEST);
      return cfg;
    },
  ]);
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const targetKey = project.findTargetKey(TARGET);
    const groupKey = project.findPBXGroupKey({ name: TARGET });
    if (!targetKey || !groupKey) return cfg; // the prebuild check reports it
    const group = project.getPBXGroupByKey(groupKey);
    const already = (group.children ?? []).some((c) => c.comment === FILE);
    if (!already) {
      // pbxResourcesBuildPhaseObj falls back to the app's phase when the target
      // has none, so look at this target's own phases.
      const objects = project.hash.project.objects;
      const target = objects.PBXNativeTarget[targetKey];
      let phaseKey = target.buildPhases.find((b) => b.comment === 'Resources')?.value;
      if (!phaseKey) {
        phaseKey = project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', targetKey).uuid;
      }
      // Written by hand: addResourceFile needs a top-level "Resources" group and
      // dedupes by path, which collides with the app's own PrivacyInfo.xcprivacy.
      const fileRef = project.generateUuid();
      const buildFile = project.generateUuid();
      objects.PBXFileReference[fileRef] = {
        isa: 'PBXFileReference',
        lastKnownFileType: 'text.xml',
        path: FILE,
        sourceTree: '"<group>"',
      };
      objects.PBXFileReference[`${fileRef}_comment`] = FILE;
      objects.PBXBuildFile[buildFile] = { isa: 'PBXBuildFile', fileRef, fileRef_comment: FILE };
      objects.PBXBuildFile[`${buildFile}_comment`] = `${FILE} in Resources`;
      group.children.push({ value: fileRef, comment: FILE });
      objects.PBXResourcesBuildPhase[phaseKey].files.push({
        value: buildFile,
        comment: `${FILE} in Resources`,
      });
    }
    return cfg;
  });
}

module.exports = withWidgetPrivacyManifest;
module.exports.MANIFEST = MANIFEST;
