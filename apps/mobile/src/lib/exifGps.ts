/**
 * Finds location data in a JPEG or WebP file (T-UNIT-MEDIA-03; CLAUDE.md
 * rule 11: EXIF is stripped from every photo). Used by the tests and by
 * `scripts/verify/exif-check.mjs` on the objects that actually reach storage.
 * No dependencies: walks the JPEG APP1 / WebP EXIF chunk to the TIFF IFD0
 * and looks for the GPS pointer tag (0x8825).
 */

export type ExifReport = { hasExif: boolean; hasGps: boolean };

const GPS_TAG = 0x8825;

function tiffHasGps(b: Uint8Array, start: number): boolean {
  if (start + 8 > b.length) return false;
  const little = b[start] === 0x49 && b[start + 1] === 0x49; // "II"
  const u16 = (o: number) =>
    little
      ? (b[o] as number) | ((b[o + 1] as number) << 8)
      : ((b[o] as number) << 8) | (b[o + 1] as number);
  const u32 = (o: number) =>
    little
      ? ((b[o] as number) | ((b[o + 1] as number) << 8) | ((b[o + 2] as number) << 16)) +
        (b[o + 3] as number) * 2 ** 24
      : (b[o] as number) * 2 ** 24 +
        (((b[o + 1] as number) << 16) | ((b[o + 2] as number) << 8) | (b[o + 3] as number));
  const ifd0 = start + u32(start + 4);
  if (ifd0 + 2 > b.length) return false;
  const count = u16(ifd0);
  for (let i = 0; i < count; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 2 > b.length) return false;
    if (u16(entry) === GPS_TAG) return true;
  }
  return false;
}

function ascii(b: Uint8Array, at: number, len: number): string {
  return String.fromCharCode(...b.subarray(at, at + len));
}

export function inspectExif(bytes: Uint8Array): ExifReport {
  const b = bytes;
  // JPEG: FFD8, then marker segments until the image data starts.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    let hasExif = false;
    let hasGps = false;
    while (o + 4 <= b.length && b[o] === 0xff) {
      const marker = b[o + 1] as number;
      if (marker === 0xda || marker === 0xd9) break; // start of scan / end
      const len = ((b[o + 2] as number) << 8) | (b[o + 3] as number);
      if (marker === 0xe1 && ascii(b, o + 4, 4) === 'Exif') {
        hasExif = true;
        hasGps = hasGps || tiffHasGps(b, o + 10);
      }
      o += 2 + len;
    }
    return { hasExif, hasGps };
  }
  // WebP: RIFF....WEBP then chunks (fourcc, little-endian size, data, pad).
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    let o = 12;
    let hasExif = false;
    let hasGps = false;
    while (o + 8 <= b.length) {
      const id = ascii(b, o, 4);
      const size =
        ((b[o + 4] as number) | ((b[o + 5] as number) << 8) | ((b[o + 6] as number) << 16)) +
        (b[o + 7] as number) * 2 ** 24;
      if (id === 'EXIF') {
        hasExif = true;
        // Some writers keep the "Exif\0\0" prefix inside the chunk.
        const start = ascii(b, o + 8, 4) === 'Exif' ? o + 14 : o + 8;
        hasGps = hasGps || tiffHasGps(b, start);
      }
      if (id === 'XMP ' && /GPS(Latitude|Longitude)/.test(ascii(b, o + 8, Math.min(size, 65536)))) {
        hasGps = true;
      }
      o += 8 + size + (size % 2);
    }
    return { hasExif, hasGps };
  }
  return { hasExif: false, hasGps: false };
}
