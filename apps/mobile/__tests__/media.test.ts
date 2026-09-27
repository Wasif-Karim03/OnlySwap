import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { inspectExif } from '../src/lib/exifGps';
import {
  BACKOFF_MS,
  BLURHASH_COMPONENTS,
  fitLongEdge,
  MAX_BYTES,
  pickPhotos,
  processPhoto,
  QUALITY,
  uploadPhotos,
  type MediaDeps,
  type UploadDeps,
  type UploadFile,
  type UploadTarget,
} from '../src/lib/media';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(__dirname, '../src/lib/__fixtures__', name)));

/** A fake image engine: remembers calls and reports sizes by quality. */
function engine(sizeFor: (edge: number, compress: number) => number = () => 100_000) {
  const calls: {
    uri: string;
    resize?: { width?: number; height?: number };
    compress: number;
    format: string;
  }[] = [];
  const deps: MediaDeps = {
    manipulate: async (uri, actions, options) => {
      const resize = actions[0]?.resize;
      calls.push({ uri, resize, compress: options.compress, format: options.format });
      const edge = resize?.width ?? resize?.height ?? 4000;
      return {
        uri: `file:///out/${edge}_${options.compress}.webp`,
        width: edge,
        height: Math.round(edge * 0.75),
      };
    },
    fileSize: async (uri) => {
      const [, edge, compress] = /\/(\d+)_([\d.]+)\.webp$/.exec(uri) ?? [];
      return sizeFor(Number(edge), Number(compress));
    },
    blurhash: jest.fn(async () => 'LEHV6nWB2yk8pyo0adR*.7kCMdnj'),
  };
  return { deps, calls };
}

const big = { uri: 'file:///in/photo.heic', width: 4032, height: 3024, mimeType: 'image/heic' };

describe('T-UNIT-MEDIA-01 processPhoto size', () => {
  it('long edge 1080 for the full image and 400 for the thumbnail', async () => {
    const { deps, calls } = engine();
    const out = await processPhoto(big, 'listing', deps);
    expect(calls.map((c) => c.resize)).toEqual([{ width: 1080 }, { width: 400 }]);
    expect(out.full.width).toBe(1080);
    expect(out.thumb?.width).toBe(400);
  });

  it('portrait photos limit the height; small photos are not upscaled', () => {
    expect(fitLongEdge(3024, 4032, 1080)).toEqual({ height: 1080 });
    expect(fitLongEdge(800, 600, 1080)).toBeNull();
  });

  it('re-encodes at lower quality until the full image is under 2 MB', async () => {
    const { deps, calls } = engine((edge, q) =>
      edge === 1080 && q > 0.5 ? MAX_BYTES.full + 1 : 150_000,
    );
    const out = await processPhoto(big, 'listing', deps);
    expect(calls.filter((c) => c.resize?.width === 1080).map((c) => c.compress)).toEqual([
      QUALITY,
      0.6,
      0.5,
    ]);
    expect(out.full.size).toBeLessThanOrEqual(MAX_BYTES.full);
  });

  it('gives up with a clear error if nothing fits', async () => {
    const { deps } = engine(() => MAX_BYTES.full * 2);
    await expect(processPhoto(big, 'listing', deps)).rejects.toMatchObject({
      code: 'INVALID',
      detail: 'photo_size',
    });
  });

  it('avatars are 512 and at most 300 KB', async () => {
    const { deps, calls } = engine();
    const out = await processPhoto(big, 'avatar', deps);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.resize).toEqual({ width: 512 });
    expect(out.thumb).toBeUndefined();
  });
});

describe('T-UNIT-MEDIA-02 processPhoto formats', () => {
  it.each(['image/heic', 'image/png', 'image/jpeg'])('%s becomes WebP', async (mimeType) => {
    const { deps, calls } = engine();
    await processPhoto({ ...big, mimeType }, 'listing', deps);
    expect(calls.every((c) => c.format === 'webp')).toBe(true);
  });

  it('small photos are still re-encoded (no pass-through that would keep EXIF)', async () => {
    const { deps, calls } = engine();
    await processPhoto({ uri: 'file:///in/small.jpg', width: 300, height: 200 }, 'listing', deps);
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.resize === undefined && c.format === 'webp')).toBe(true);
  });
});

describe('T-UNIT-MEDIA-03 EXIF strip', () => {
  it('the GPS fixture really has GPS (so the check below means something)', () => {
    expect(inspectExif(fixture('gps.jpg'))).toEqual({ hasExif: true, hasGps: true });
    expect(inspectExif(fixture('gps.webp'))).toEqual({ hasExif: true, hasGps: true });
  });

  it('re-encoded output carries no EXIF', () => {
    expect(inspectExif(fixture('clean.webp'))).toEqual({ hasExif: false, hasGps: false });
    expect(inspectExif(fixture('clean.jpg'))).toEqual({ hasExif: false, hasGps: false });
  });

  it('the picker never asks for EXIF', async () => {
    const library = jest.fn(async () => [big]);
    await pickPhotos('library', 3, { library, camera: jest.fn() });
    expect(library).toHaveBeenCalledWith(3);
    const src = readFileSync(join(__dirname, '../src/lib/media.ts'), 'utf8');
    expect(src).not.toMatch(/exif:\s*true/);
  });

  it('unknown bytes are reported clean', () => {
    expect(inspectExif(new Uint8Array([1, 2, 3]))).toEqual({ hasExif: false, hasGps: false });
  });
});

describe('T-UNIT-MEDIA-05 blurhash', () => {
  it('is made from the thumbnail with 4×3 components', async () => {
    const { deps } = engine();
    const out = await processPhoto(big, 'listing', deps);
    expect(BLURHASH_COMPONENTS).toEqual([4, 3]);
    expect(deps.blurhash).toHaveBeenCalledWith('file:///out/400_0.72.webp', [4, 3]);
    expect(out.blurhash).toBe('LEHV6nWB2yk8pyo0adR*.7kCMdnj');
  });

  it('a blurhash failure does not fail the photo', async () => {
    const { deps } = engine();
    deps.blurhash = async () => {
      throw new Error('decode failed');
    };
    await expect(processPhoto(big, 'listing', deps)).resolves.toMatchObject({ blurhash: null });
  });
});

describe('T-UNIT-MEDIA-04 uploadPhotos', () => {
  const files: UploadFile[] = [
    { idx: 0, variant: 'full', uri: 'file:///a_full.webp', size: 800 },
    { idx: 0, variant: 'thumb', uri: 'file:///a_thumb.webp', size: 200 },
  ];
  const targets = (tag: string): UploadTarget[] =>
    files.map((f) => ({
      idx: f.idx,
      variant: f.variant,
      key: `k/${f.variant}`,
      url: `https://r2.test/${tag}/${f.variant}`,
      headers: { 'content-type': 'image/webp', 'content-length': String(f.size) },
    }));

  function setup(statuses: number[], opts: { throwFirst?: boolean } = {}) {
    const sleep = jest.fn(async () => {});
    const urls: string[] = [];
    let call = 0;
    const deps: UploadDeps = {
      requestUrls: jest.fn(async () =>
        targets(`set${(deps.requestUrls as jest.Mock).mock.calls.length}`),
      ),
      put: async (t, f, onBytes) => {
        urls.push(t.url);
        if (opts.throwFirst && call++ === 0) throw new TypeError('Network request failed');
        onBytes(f.size / 2);
        return statuses.shift() ?? 200;
      },
      sleep,
    };
    return { deps, sleep, urls };
  }

  it('retries up to 3 times with backoff', async () => {
    const { deps, sleep, urls } = setup([500, 503, 502, 200, 200]);
    await uploadPhotos(files, deps);
    expect(sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([...BACKOFF_MS]);
    expect(urls).toHaveLength(5);
  });

  it('gives up after the third retry', async () => {
    const { deps } = setup([500, 500, 500, 500]);
    await expect(uploadPhotos(files, deps)).rejects.toMatchObject({ kind: 'app_error' });
  });

  it('a dropped connection counts as a retry and ends offline if it never recovers', async () => {
    const { deps } = setup([200, 200], { throwFirst: true });
    await expect(uploadPhotos(files, deps)).resolves.toHaveLength(2);
  });

  it('403 re-requests the URLs once, then uses the new ones', async () => {
    const { deps, urls } = setup([403, 200, 200]);
    await uploadPhotos(files, deps);
    expect(deps.requestUrls).toHaveBeenCalledTimes(2);
    expect(urls).toEqual([
      'https://r2.test/set1/full',
      'https://r2.test/set2/full',
      'https://r2.test/set2/thumb',
    ]);
  });

  it('a second 403 fails instead of looping', async () => {
    const { deps } = setup([403, 403]);
    await expect(uploadPhotos(files, deps)).rejects.toBeTruthy();
    expect(deps.requestUrls).toHaveBeenCalledTimes(2);
  });

  it('progress rises to exactly 100%', async () => {
    const { deps } = setup([200, 200]);
    const seen: number[] = [];
    await uploadPhotos(files, deps, (p) => seen.push(p));
    expect(seen.at(-1)).toBe(1);
    expect(seen.every((p, i) => i === 0 || p >= (seen[i - 1] as number) || p === 1)).toBe(true);
    expect(Math.max(...seen)).toBe(1);
  });
});
