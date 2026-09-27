import { motion } from '@onlyswap/tokens';

import { resolveMotion, type MotionKind } from '../src/theme/motion';

const KINDS: MotionKind[] = ['tap', 'sheet', 'swipe', 'success', 'fade'];

describe('P2-MOT-01 motion primitives', () => {
  it('uses the DESIGN_SYSTEM §5 values when motion is allowed', () => {
    expect(resolveMotion('tap', false)).toEqual({ type: 'timing', duration: 120, easing: 'out' });
    expect(resolveMotion('sheet', false)).toEqual({ type: 'spring', damping: 22, stiffness: 240 });
    expect(resolveMotion('swipe', false)).toEqual({ type: 'spring', damping: 18, stiffness: 180 });
    expect(resolveMotion('success', false)).toEqual({
      type: 'timing',
      duration: 400,
      easing: 'out',
    });
  });

  it.each(KINDS)('reduce motion swaps %s to the 150 ms fade', (kind) => {
    expect(resolveMotion(kind, true)).toEqual({
      type: 'timing',
      duration: motion.fade.duration,
      easing: 'linear',
    });
  });

  it('never returns a spring when reduced', () => {
    for (const kind of KINDS) expect(resolveMotion(kind, true).type).toBe('timing');
  });
});
