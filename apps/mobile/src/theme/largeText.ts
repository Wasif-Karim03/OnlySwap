import { useWindowDimensions } from 'react-native';

/** Dynamic Type scale at which side-by-side layouts stack (QA-H5). */
export const LARGE_TEXT_SCALE = 1.3;

/**
 * True when the user's text size is large enough that fixed side-by-side rows
 * would break words mid-word, so they stack instead. Default sizes stay as is.
 */
export function useLargeText(): boolean {
  const { fontScale } = useWindowDimensions();
  return fontScale >= LARGE_TEXT_SCALE;
}
