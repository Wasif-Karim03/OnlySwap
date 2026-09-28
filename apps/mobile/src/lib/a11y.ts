import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

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
