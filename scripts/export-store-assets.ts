// Store assets (P16-STORE-01, RELEASE §5, TESTING §7).
//   1. maestro test apps/mobile/.maestro/store/screenshots.yaml (per platform) → store-assets/raw/
//      and, for iPad (P17-FEAT-02), store/screenshots-ipad.yaml on a 13-inch iPad simulator
//   2. node --experimental-strip-types scripts/export-store-assets.ts
// Writes store-assets/{ios,ipad,android}/ with each real screenshot framed under one
// caption, at the exact sizes the stores accept (JPEG, no alpha), plus the Play
// feature graphic and the 512 px icon, then checks every size. Uses the
// Chromium from the e2e/web workspace (`pnpm --filter e2e-web exec playwright install chromium`).
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const raw = join(root, 'store-assets/raw');
const outDir = join(root, 'store-assets');

// One idea per screenshot, R1.0 features only (no Quad: hidden features get rejected).
export const CAPTIONS = [
  "Swipe what's for sale on your campus",
  'Make an offer. Chat once they say yes.',
  'Plan the meetup. Pay in person.',
  'Only verified students. No randoms.',
  'Sell something in under a minute.',
];

export const SIZES = {
  ios: { w: 1320, h: 2868 },
  // 13-inch iPad, portrait (App Store Connect's required iPad size).
  ipad: { w: 2064, h: 2752 },
  android: { w: 1080, h: 1920 },
  feature: { w: 1024, h: 500 },
  icon: { w: 512, h: 512 },
} as const;

/** Screenshot sets, each framed at SIZES[platform]. A set with no raw shots is skipped. */
export const PLATFORMS = ['ios', 'ipad', 'android'] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Device corner radius in the frame, as a share of the width (an iPad is squarer). */
export const FRAME_RADIUS: Record<Platform, number> = { ios: 0.08, ipad: 0.03, android: 0.08 };

/** Width and height from a JPEG (SOF marker) or PNG (IHDR) header. */
export function imageSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.subarray(1, 4).toString() === 'PNG')
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1]!;
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3)
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

export function frameHtml(opts: {
  caption: string;
  shot: string;
  w: number;
  h: number;
  radius?: number;
}): string {
  const { caption, shot, w, h, radius = FRAME_RADIUS.ios } = opts;
  const pad = Math.round(w * 0.07);
  return `<!doctype html><html><head><style>
    html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#C8E27D;font-family:-apple-system,system-ui,sans-serif}
    h1{margin:0;padding:${Math.round(h * 0.06)}px ${pad}px 0;font-size:${Math.round(w * 0.078)}px;line-height:1.08;letter-spacing:-.04em;font-weight:800;color:#111110}
    .phone{position:absolute;left:${pad}px;right:${pad}px;bottom:-${Math.round(h * 0.04)}px;top:${Math.round(h * 0.17)}px;border-radius:${Math.round(w * radius)}px;overflow:hidden;background:#000;box-shadow:0 30px 80px rgba(0,0,0,.25)}
    .phone img{width:100%;display:block}
  </style></head><body><h1>${caption.replace(/</g, '&lt;')}</h1><div class="phone"><img src="${shot}"></div></body></html>`;
}

async function main() {
  const req = createRequire(join(root, 'e2e/web/package.json'));
  const { chromium } = req('@playwright/test') as typeof import('@playwright/test');
  const browser = await chromium.launch();
  const made: { file: string; want: { w: number; h: number } }[] = [];
  const dataUrl = (file: string) =>
    `data:image/png;base64,${readFileSync(file).toString('base64')}`;

  for (const platform of PLATFORMS) {
    const size = SIZES[platform];
    mkdirSync(join(outDir, platform), { recursive: true });
    for (let n = 1; n <= CAPTIONS.length; n += 1) {
      const src = join(raw, `${platform}-${n}.png`);
      if (!existsSync(src)) {
        console.warn(`missing ${src}; run the Maestro store flow for ${platform}`);
        continue;
      }
      const page = await browser.newPage({ viewport: { width: size.w, height: size.h } });
      await page.setContent(
        frameHtml({
          caption: CAPTIONS[n - 1]!,
          shot: dataUrl(src),
          w: size.w,
          h: size.h,
          radius: FRAME_RADIUS[platform],
        }),
      );
      const file = join(outDir, platform, `${n}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
      await page.close();
      made.push({ file, want: size });
    }
  }

  // Play feature graphic: name, one line, the Discover screenshot.
  const featureShot = [join(raw, 'android-1.png'), join(raw, 'ios-1.png')].find(existsSync);
  {
    const { w, h } = SIZES.feature;
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(`<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#C8E27D;font-family:-apple-system,system-ui,sans-serif;color:#111110">
      <div style="position:absolute;left:64px;top:0;bottom:0;width:520px;display:flex;flex-direction:column;justify-content:center">
        <div style="font-size:40px;font-weight:800;letter-spacing:-.055em">onlyswap</div>
        <div style="font-size:46px;font-weight:800;letter-spacing:-.045em;line-height:1.05;margin-top:22px">Buy and sell with students at your school.</div></div>
      ${featureShot ? `<div style="position:absolute;right:70px;top:40px;width:250px;height:520px;border-radius:30px;overflow:hidden;transform:rotate(5deg);box-shadow:0 20px 60px rgba(0,0,0,.25)"><img src="${dataUrl(featureShot)}" style="width:100%"></div>` : ''}
      </body></html>`);
    const file = join(outDir, 'android', 'feature-graphic.jpg');
    mkdirSync(join(outDir, 'android'), { recursive: true });
    await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
    await page.close();
    made.push({ file, want: SIZES.feature });
  }

  // Play icon 512 from the app icon.
  {
    const icon = join(root, 'apps/mobile/assets/images/icon.png');
    const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
    await page.setContent(
      `<body style="margin:0"><img src="${dataUrl(icon)}" style="width:512px;height:512px;display:block"></body>`,
    );
    const file = join(outDir, 'android', 'icon-512.png');
    await page.screenshot({ path: file, type: 'png' });
    await page.close();
    made.push({ file, want: SIZES.icon });
  }
  await browser.close();

  let bad = 0;
  for (const m of made) {
    const got = imageSize(readFileSync(m.file));
    const ok = got && got.w === m.want.w && got.h === m.want.h;
    if (!ok) bad += 1;
    console.log(`${ok ? 'ok  ' : 'BAD '} ${m.file.replace(root, '')} ${got?.w}x${got?.h}`);
  }
  console.log(`${made.length} files in store-assets/ (${readdirSync(outDir).join(', ')})`);
  process.exit(bad ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
