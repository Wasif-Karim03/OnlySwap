import type { ComponentProps, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

/**
 * Web stand-in for react-native-keyboard-controller (P13-WEB-07). The library
 * has no web build: its views measure the native keyboard and collapse to
 * zero height in a browser, where the page itself handles the keyboard.
 * metro.config.js points the web bundle here; iOS and Android keep the real
 * library. Only the parts the app imports are provided, as plain views.
 */

type KeyboardOnlyProps = {
  /** Keyboard-controller-only props, accepted and ignored on web. */
  bottomOffset?: number;
  extraKeyboardSpace?: number;
  disableScrollOnKeyboardHide?: boolean;
  enabled?: boolean;
  behavior?: 'height' | 'position' | 'padding' | 'translate-with-padding';
  keyboardVerticalOffset?: number;
  offset?: { closed?: number; opened?: number };
};

function strip<P extends KeyboardOnlyProps>(props: P): Omit<P, keyof KeyboardOnlyProps> {
  const {
    bottomOffset: _b,
    extraKeyboardSpace: _e,
    disableScrollOnKeyboardHide: _d,
    enabled: _en,
    behavior: _be,
    keyboardVerticalOffset: _k,
    offset: _o,
    ...rest
  } = props;
  return rest;
}

export function KeyboardProvider({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export function KeyboardAvoidingView(props: ComponentProps<typeof View> & KeyboardOnlyProps) {
  return <View {...strip(props)} />;
}

export function KeyboardStickyView(props: ComponentProps<typeof View> & KeyboardOnlyProps) {
  return <View {...strip(props)} />;
}

export function KeyboardAwareScrollView(
  props: ComponentProps<typeof ScrollView> & KeyboardOnlyProps,
) {
  return <ScrollView {...strip(props)} />;
}

export type KeyboardState = {
  isVisible: boolean;
  height: number;
  duration: number;
  timestamp: number;
  target: number;
  type: string;
  appearance: string;
};

/** The on-screen keyboard is never "open" from the app's point of view on web. */
export const CLOSED_KEYBOARD: KeyboardState = {
  isVisible: false,
  height: 0,
  duration: 0,
  timestamp: 0,
  target: -1,
  type: 'default',
  appearance: 'default',
};

export function useKeyboardState<T = KeyboardState>(selector?: (state: KeyboardState) => T): T {
  return selector ? selector(CLOSED_KEYBOARD) : (CLOSED_KEYBOARD as T);
}

export const KeyboardController = {
  dismiss: async () => {
    (globalThis.document?.activeElement as { blur?: () => void } | null | undefined)?.blur?.();
  },
  setFocusTo: () => {},
  isVisible: () => false,
  state: () => CLOSED_KEYBOARD,
};
