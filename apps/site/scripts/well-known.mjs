// Writes public/.well-known/{apple-app-site-association,assetlinks.json} for
// universal links and Android App Links (P11-STATE-02, P13-WEB-01).
// Public values, set in the Pages build environment:
//   APPLE_TEAM_ID       Apple Developer Team ID (after OWNER_TODO: Apple account)
//   ANDROID_SHA256      Play App Signing certificate SHA-256 (Play Console → App integrity)
// Missing values leave a placeholder and a warning, so local builds still work.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUNDLE_ID = 'app.onlyswap';
/** Paths the app opens; everything else stays on the web. */
export const APP_PATHS = ['/l/*'];

export function appleAssociation(teamId) {
  return {
    applinks: {
      details: [
        { appIDs: [`${teamId}.${BUNDLE_ID}`], components: APP_PATHS.map((p) => ({ '/': p })) },
      ],
    },
  };
}

export function assetLinks(sha256List) {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: BUNDLE_ID,
        sha256_cert_fingerprints: sha256List,
      },
    },
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const team = process.env.APPLE_TEAM_ID || 'TEAMID';
  const shas = (process.env.ANDROID_SHA256 || 'SHA256_PLACEHOLDER').split(',').map((s) => s.trim());
  if (team === 'TEAMID')
    console.warn('well-known: APPLE_TEAM_ID not set; universal links will not verify');
  if (shas[0] === 'SHA256_PLACEHOLDER')
    console.warn('well-known: ANDROID_SHA256 not set; App Links will not verify');
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', '.well-known');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'apple-app-site-association'),
    JSON.stringify(appleAssociation(team), null, 2) + '\n',
  );
  writeFileSync(join(dir, 'assetlinks.json'), JSON.stringify(assetLinks(shas), null, 2) + '\n');
}
