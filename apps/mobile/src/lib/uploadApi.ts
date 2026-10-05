import { toAppError } from './errors';
import type { UploadFile, UploadTarget } from './media';
import { getSupabase } from './supabase';

export type UploadKind = 'listing' | 'avatar' | 'share' | 'quad' | 'chat';

type Invoke = (
  name: string,
  options: { body: Record<string, unknown> },
) => PromiseLike<{ data: unknown; error: unknown }>;

/**
 * Asks `upload-url` for presigned PUT URLs (P5-MEDIA-02). Only the index,
 * variant, type and byte size are sent; the server picks the keys.
 */
export function createUploadApi(invoke: Invoke) {
  return {
    async requestUrls(
      kind: UploadKind,
      targetId: string,
      files: UploadFile[],
    ): Promise<UploadTarget[]> {
      const { data, error } = await invoke('upload-url', {
        body: {
          kind,
          target_id: targetId,
          files: files.map((f) => ({
            idx: f.idx,
            variant: f.variant,
            type: kind === 'share' ? 'image/jpeg' : 'image/webp',
            size: f.size,
          })),
        },
      });
      if (error) throw toAppError(error);
      const uploads = (data as { uploads?: UploadTarget[] } | null)?.uploads;
      if (!Array.isArray(uploads)) throw toAppError({ message: 'upload-url returned no uploads' });
      return uploads;
    },
  };
}

export const uploadApi = createUploadApi((name, options) =>
  getSupabase().functions.invoke(name, options),
);
