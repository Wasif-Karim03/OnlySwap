/**
 * Swipe deck math (DESIGN_SYSTEM §5 deck rules, T-UNIT-FEED-02). Every
 * function is a worklet so the gesture runs on the UI thread.
 */

export type SwipeDir = 'left' | 'right' | 'save';

/** Release past 35% of the card width, or a fling of 800 px/s. */
export const RELEASE_FRACTION = 0.35;
export const RELEASE_VELOCITY = 800;
/** Rotation at a full card width, clamped. */
export const MAX_ROTATION = 12;
/** The stamp is fully visible at 25% of the width. */
export const STAMP_FRACTION = 0.25;
/** The card under the top one starts at this scale. */
export const NEXT_SCALE = 0.95;
/** Fly-out duration (motion token `swipe`). */
export const FLY_MS = 220;

function clamp(v: number, lo: number, hi: number): number {
  'worklet';
  return Math.min(Math.max(v, lo), hi);
}

/** rotation = x / width × 12°, clamped to ±12°. */
export function rotationFor(x: number, width: number): number {
  'worklet';
  if (width <= 0) return 0;
  return clamp((x / width) * MAX_ROTATION, -MAX_ROTATION, MAX_ROTATION);
}

/** Opacity of the Offer (right) or Skip (left) stamp for a drag of `x`. */
export function stampOpacity(x: number, width: number, side: 'left' | 'right'): number {
  'worklet';
  if (width <= 0) return 0;
  const toward = side === 'right' ? x : -x;
  return clamp(toward / (width * STAMP_FRACTION), 0, 1);
}

/** Has the drag crossed the release line (for the one selection haptic)? */
export function pastThreshold(x: number, width: number): boolean {
  'worklet';
  return width > 0 && Math.abs(x) >= width * RELEASE_FRACTION;
}

/**
 * Where a released card goes: off to a side, or back to the middle (null).
 * A fling counts only in the direction of the drag, so a flick back cancels.
 */
export function releaseDir(x: number, vx: number, width: number): 'left' | 'right' | null {
  'worklet';
  if (pastThreshold(x, width)) return x > 0 ? 'right' : 'left';
  if (Math.abs(vx) >= RELEASE_VELOCITY && Math.sign(vx) === Math.sign(x) && x !== 0) {
    return vx > 0 ? 'right' : 'left';
  }
  return null;
}

/** The next card grows 0.95 → 1 as the top card reaches the release line. */
export function nextScale(x: number, width: number): number {
  'worklet';
  if (width <= 0) return NEXT_SCALE;
  const t = clamp(Math.abs(x) / (width * RELEASE_FRACTION), 0, 1);
  return NEXT_SCALE + (1 - NEXT_SCALE) * t;
}

/** Off-screen target for the fly-out. Save leaves upwards. */
export function flyTarget(dir: SwipeDir, width: number, height: number): { x: number; y: number } {
  'worklet';
  if (dir === 'save') return { x: 0, y: -height * 1.2 };
  return { x: (dir === 'right' ? 1 : -1) * width * 1.5, y: 0 };
}
