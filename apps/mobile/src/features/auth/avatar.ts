import { toAppError } from '@/lib/errors';
import {
  pickPhotos,
  processPhoto,
  uploadPhotos,
  xhrPut,
  type PickedPhoto,
  type UploadFile,
} from '@/lib/media';
import { getSupabase } from '@/lib/supabase';
import { uploadApi } from '@/lib/uploadApi';

/**
 * Avatar pipeline for A06 (P4-AUTH-08): pick one photo, re-encode it to a
 * 512 px WebP with no EXIF (P5-MEDIA-03), upload it to the key upload-url
 * picks, and return that key for update_profile.
 */
export type AvatarDeps = {
  /** One photo from the library, or null when the picker was cancelled. */
  pick: () => Promise<PickedPhoto | null>;
  /** Encodes and uploads; reports 0 to 1; resolves with the object key. */
  upload: (photo: PickedPhoto, onProgress: (fraction: number) => void) => Promise<string>;
};

export const avatarDeps: AvatarDeps = {
  pick: async () => (await pickPhotos('library', 1))[0] ?? null,
  upload: async (photo, onProgress) => {
    const user = (await getSupabase().auth.getUser()).data.user;
    if (!user) throw toAppError({ code: 'P0001', message: 'NOT_AUTHENTICATED' });
    const encoded = await processPhoto(photo, 'avatar');
    const files: UploadFile[] = [
      { idx: 0, variant: 'full', uri: encoded.full.uri, size: encoded.full.size },
    ];
    const targets = await uploadPhotos(
      files,
      { requestUrls: (f) => uploadApi.requestUrls('avatar', user.id, f), put: xhrPut },
      onProgress,
    );
    const key = targets[0]?.key;
    if (!key) throw toAppError({ message: 'no avatar key' });
    return key;
  },
};
