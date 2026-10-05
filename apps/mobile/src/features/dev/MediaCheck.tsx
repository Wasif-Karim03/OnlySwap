import { useState } from 'react';
import { Image as RNImage, Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from '@/components/Text';
import { toAppError } from '@/lib/errors';
import { inspectExif } from '@/lib/exifGps';
import { processPhoto, uploadPhotos, xhrPut, type UploadFile } from '@/lib/media';
import { getSupabase } from '@/lib/supabase';
import { uploadApi } from '@/lib/uploadApi';
import { dev } from '@/strings';

const GPS_FIXTURE = require('@/lib/__fixtures__/gps.jpg') as number;

async function bytesOf(uri: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetch(uri)).arrayBuffer());
}

/**
 * Dev-only proof for P5-MEDIA-03 on a real device or Simulator: a JPEG with
 * GPS goes through the real encoder, and the output is checked for EXIF.
 * Optionally uploads the result as your avatar through upload-url.
 */
export function MediaCheck() {
  const [lines, setLines] = useState<string[]>([]);
  const log = (line: string) => setLines((l) => [...l, line]);

  const run = async (upload: boolean) => {
    setLines([]);
    try {
      const source = RNImage.resolveAssetSource(GPS_FIXTURE);
      const before = inspectExif(await bytesOf(source.uri));
      log(`${dev.mediaBefore} exif=${before.hasExif} gps=${before.hasGps}`);
      const out = await processPhoto(
        { uri: source.uri, width: source.width, height: source.height },
        'listing',
      );
      const full = inspectExif(await bytesOf(out.full.uri));
      const thumb = out.thumb ? inspectExif(await bytesOf(out.thumb.uri)) : null;
      log(
        `${dev.mediaAfter} full ${out.full.width}x${out.full.height} ${out.full.size}B exif=${full.hasExif} gps=${full.hasGps}`,
      );
      if (thumb && out.thumb) {
        log(
          `${dev.mediaAfter} thumb ${out.thumb.width}px exif=${thumb.hasExif} gps=${thumb.hasGps}`,
        );
      }
      log(`blurhash ${out.blurhash ?? 'none'}`);
      log(full.hasGps || thumb?.hasGps ? dev.mediaFail : dev.mediaPass);
      if (!upload) return;

      const user = (await getSupabase().auth.getUser()).data.user;
      if (!user) {
        log(dev.mediaSignIn);
        return;
      }
      const avatar = await processPhoto(
        { uri: source.uri, width: source.width, height: source.height },
        'avatar',
      );
      const files: UploadFile[] = [
        { idx: 0, variant: 'full', uri: avatar.full.uri, size: avatar.full.size },
      ];
      const targets = await uploadPhotos(
        files,
        { requestUrls: (f) => uploadApi.requestUrls('avatar', user.id, f), put: xhrPut },
        (p) => p === 1 && log(`${dev.mediaUploaded} 100%`),
      );
      log(`key ${targets[0]?.key ?? '?'}`);
    } catch (e) {
      const err = toAppError(e);
      log(`${dev.mediaError} ${err.code}${err.raw ? ` (${err.raw})` : ''}`);
    }
  };

  return (
    <View style={styles.card} testID="dev-media-check">
      <Text variant="label" tone="ink2">
        {dev.mediaLabel}
      </Text>
      {lines.map((l, i) => (
        <Text key={`${i}-${l}`} variant="meta" testID={`dev-media-line-${i}`}>
          {l}
        </Text>
      ))}
      <View style={styles.row}>
        <Pressable accessibilityRole="button" onPress={() => void run(false)} style={styles.button}>
          <Text variant="label">{dev.mediaRun}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void run(true)} style={styles.button}>
          <Text variant="label">{dev.mediaUpload}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.card,
    padding: theme.space.lg,
    gap: theme.space.sm,
  },
  row: { flexDirection: 'row', gap: theme.space.sm, flexWrap: 'wrap' },
  button: {
    minHeight: theme.size.hit,
    justifyContent: 'center',
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.bg3,
  },
}));
