import * as Reanimated from 'react-native-reanimated';

/**
 * Reanimated's synchronous reduce-motion hook. Wrapped because some Jest mocks
 * (expo-router's testing library) replace Reanimated without it; in that case
 * motion is treated as allowed.
 */
export const useReducedMotion: () => boolean =
  typeof Reanimated.useReducedMotion === 'function' ? Reanimated.useReducedMotion : () => false;
