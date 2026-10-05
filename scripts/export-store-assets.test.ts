// Store asset sizes (P16-STORE-01, P17-FEAT-02):
// node --experimental-strip-types --test scripts/export-store-assets.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CAPTIONS,
  FRAME_RADIUS,
  PLATFORMS,
  SIZES,
  frameHtml,
  imageSize,
} from './export-store-assets.ts';

test('screenshot sizes are the ones the stores accept', () => {
  assert.deepEqual(SIZES.ios, { w: 1320, h: 2868 }); // 6.9-inch iPhone
  assert.deepEqual(SIZES.ipad, { w: 2064, h: 2752 }); // 13-inch iPad, portrait
  assert.deepEqual(SIZES.android, { w: 1080, h: 1920 });
  assert.deepEqual(SIZES.feature, { w: 1024, h: 500 });
  assert.deepEqual(SIZES.icon, { w: 512, h: 512 });
});

test('every platform set is framed, iPad included, with one caption per shot', () => {
  assert.deepEqual([...PLATFORMS], ['ios', 'ipad', 'android']);
  for (const p of PLATFORMS) {
    assert.ok(SIZES[p].h > SIZES[p].w, `${p} is portrait`);
    assert.ok(FRAME_RADIUS[p] > 0 && FRAME_RADIUS[p] < 0.1);
  }
  assert.equal(CAPTIONS.length, 5);
  for (const c of CAPTIONS) assert.doesNotMatch(c, /—/); // no em dashes (CLAUDE.md rule 8)
});

test('the frame is drawn at the target size with the platform radius', () => {
  const { w, h } = SIZES.ipad;
  const html = frameHtml({ caption: 'A <b>', shot: 'data:x', w, h, radius: FRAME_RADIUS.ipad });
  assert.match(html, new RegExp(`width:${w}px;height:${h}px`));
  assert.match(html, new RegExp(`border-radius:${Math.round(w * FRAME_RADIUS.ipad)}px`));
  assert.match(html, /A &lt;b>/);
  // Phones keep the old default radius.
  const phone = frameHtml({ caption: 'x', shot: 'data:x', w: 1320, h: 2868 });
  assert.match(phone, new RegExp(`border-radius:${Math.round(1320 * 0.08)}px`));
});

test('reads sizes from PNG and JPEG headers', () => {
  const png = Buffer.alloc(24);
  png.write('\x89PNG', 0, 'latin1');
  png.writeUInt32BE(2064, 16);
  png.writeUInt32BE(2752, 20);
  assert.deepEqual(imageSize(png), { w: 2064, h: 2752 });

  // SOI, then an SOF0 segment: length, precision, height, width.
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x0a, 0xc0, 0x08, 0x10]);
  assert.deepEqual(imageSize(jpeg), { w: 2064, h: 2752 });
  assert.equal(imageSize(Buffer.from('nope')), null);
});
