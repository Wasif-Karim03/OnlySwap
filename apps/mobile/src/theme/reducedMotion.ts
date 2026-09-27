import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

/** Reanimated's synchronous launch value (some Jest mocks omit the hook). */
const useLaunchValue: () => boolean =
  typeof Reanimated.useReducedMotion === 'function' ? Reanimated.useReducedMotion : () => false;

/**
 * Reduce Motion, correct on the first frame and updated live. Reanimated's hook
 * only reads the setting at launch, so the OS change event keeps it current
 * when the user flips the switch while the app is open (DESIGN_SYSTEM §5).
 */
export function useReducedMotion(): boolean {
  const launch = useLaunchValue();
  const [reduced, setReduced] = useState(launch);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
