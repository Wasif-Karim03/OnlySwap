/** Positions in the scroll content, plus the visible height above the keyboard and dock. */
export type RevealInput = {
  /** Bottom of the box that just appeared. */
  boxBottom: number;
  /** Top of the thing that must stay on screen (the focused field). */
  anchorTop: number;
  /** Current scroll offset. */
  scrollY: number;
  /** Visible height of the scroll view (0 until measured). */
  viewportH: number;
};

/**
 * Scroll offset that brings a newly shown box into view without pushing the
 * anchor above the top, or null when no scroll is needed. Only ever scrolls down.
 */
export function revealScrollY({
  boxBottom,
  anchorTop,
  scrollY,
  viewportH,
}: RevealInput): number | null {
  if (viewportH <= 0) return null;
  const target = Math.min(boxBottom - viewportH, anchorTop);
  return target > scrollY ? target : null;
}
