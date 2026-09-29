// P13-WEB-01 / P11-STATE-02: the association files open /l/* in the app.
import assert from 'node:assert/strict';
import { test } from 'node:test';

// @ts-expect-error: plain JS build script
import { appleAssociation, assetLinks, BUNDLE_ID } from '../scripts/well-known.mjs';

test('AASA lists the app id and only the listing paths', () => {
  const a = appleAssociation('ABCDE12345');
  assert.deepEqual(a.applinks.details[0].appIDs, [`ABCDE12345.${BUNDLE_ID}`]);
  assert.deepEqual(a.applinks.details[0].components, [{ '/': '/l/*' }]);
});

test('assetlinks delegates handle_all_urls to the package', () => {
  const l = assetLinks(['AA:BB']);
  assert.equal(l[0].target.package_name, 'app.onlyswap');
  assert.deepEqual(l[0].target.sha256_cert_fingerprints, ['AA:BB']);
});
