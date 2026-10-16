import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, type AccessibilityState } from 'react-native';

/** VoiceOver / TalkBack on, updated live (swipe deck list mode, DESIGN_SYSTEM X33). */
export function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled().then((v) => {
      if (alive) setOn(v);
    });
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}

type A11yStateProps = {
  accessibilityState?: AccessibilityState;
  'aria-busy'?: boolean;
  'aria-checked'?: boolean | 'mixed';
  'aria-disabled'?: boolean;
  'aria-expanded'?: boolean;
  'aria-selected'?: boolean;
};

/**
 * accessibilityState plus, on the web, the same state as aria-* props.
 * react-native-web 0.21 ignores accessibilityState, so switches, checkboxes,
 * tabs and chips never said whether they were on in a browser.
 */
export function a11yState(
  state: AccessibilityState | undefined,
  os: string = Platform.OS,
): A11yStateProps {
  if (!state) return {};
  if (os !== 'web') return { accessibilityState: state };
  const out: A11yStateProps = { accessibilityState: state };
  if (state.busy !== undefined) out['aria-busy'] = state.busy;
  if (state.checked !== undefined) out['aria-checked'] = state.checked;
  if (state.disabled !== undefined) out['aria-disabled'] = state.disabled;
  if (state.expanded !== undefined) out['aria-expanded'] = state.expanded;
  if (state.selected !== undefined) out['aria-selected'] = state.selected;
  return out;
}
