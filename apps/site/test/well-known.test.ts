// P13-WEB-01 / P11-STATE-02 / R11-INVITE-01: the association files open /l/* and /i/* in the app.
import assert from 'node:assert/strict';
import { test } from 'node:test';

// @ts-expect-error: plain JS build script
import { APP_PATHS, appleAssociation, assetLinks, BUNDLE_ID } from '../scripts/well-known.mjs';

test('AASA lists the app id and only the listing and invite paths', () => {
  const a = appleAssociation('ABCDE12345');
  assert.deepEqual(a.applinks.details[0].appIDs, [`ABCDE12345.${BUNDLE_ID}`]);
  assert.deepEqual(a.applinks.details[0].components, [{ '/': '/l/*' }, { '/': '/i/*' }]);
});

test('the Android intent filters cover every app path', async () => {
  const { readFileSync } = await import('node:fs');
  const config = readFileSync(new URL('../../mobile/app.config.ts', import.meta.url), 'utf8');
  for (const p of APP_PATHS) {
    assert.ok(
      config.includes(`pathPrefix: '${p.replace('*', '')}'`),
      `${p} missing in app.config.ts`,
    );
  }
});

test('assetlinks delegates handle_all_urls to the package', () => {
  const l = assetLinks(['AA:BB']);
  assert.equal(l[0].target.package_name, 'app.onlyswap');
  assert.deepEqual(l[0].target.sha256_cert_fingerprints, ['AA:BB']);
});
