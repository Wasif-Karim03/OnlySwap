import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { Platform, View } from 'react-native';

import { getEnv } from '@/lib/env';
import {
  loadTurnstile,
  mountTurnstile,
  turnstileSiteKey,
  type DocumentLike,
  type TurnstileWidget,
  type WindowLike,
} from '@/lib/turnstile';
import { banner as copy } from '@/strings';

export type TurnstileFieldProps = {
  siteKey: string;
  onToken: (token: string | null) => void;
  /** A new value resets the widget (tokens are single use). */
  resetKey: number;
};

/**
 * Web-only Cloudflare Turnstile check (LR-04). Mounts the widget on a View
 * (a DOM node under react-native-web), resets it when `resetKey` changes and
 * removes it on unmount. Renders nothing on native.
 */
export function TurnstileField({ siteKey, onToken, resetKey }: TurnstileFieldProps) {
  const ref = useRef<View>(null);
  const widget = useRef<TurnstileWidget | null>(null);
  const tokenCb = useRef(onToken);
  useEffect(() => {
    tokenCb.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    let live = true;
    const g = globalThis as unknown as { window?: WindowLike; document?: DocumentLike };
    if (!g.window || !g.document) return undefined;
    loadTurnstile(g.window, g.document)
      .then((api) => {
        if (!live || !ref.current) return;
        widget.current = mountTurnstile(api, ref.current, siteKey, (t) => tokenCb.current(t));
      })
      .catch(() => tokenCb.current(null));
    return () => {
      live = false;
      widget.current?.remove();
      widget.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetKey > 0) widget.current?.reset();
  }, [resetKey]);

  if (Platform.OS !== 'web') return null;
  return <View ref={ref} accessibilityLabel={copy.botCheckLabel} testID="turnstile" />;
}

/** Test seam: the field to render and the site key it needs (null = off). */
export type TurnstileSeam = {
  Field: ComponentType<TurnstileFieldProps>;
  siteKey: string | null;
};

/** Native never reads env here; web throws if the key is missing (IR4-04). */
function defaultSiteKey(): string | null {
  if (Platform.OS !== 'web') return null;
  return turnstileSiteKey(getEnv(), 'web');
}

/**
 * State for one form's bot check. `required` is true on the web build with a
 * site key; submit stays disabled until `token` is set. Call `reset()` after
 * every submission, success or not.
 */
export function useTurnstile(seam?: TurnstileSeam) {
  const [siteKey] = useState(() => (seam ? seam.siteKey : defaultSiteKey()));
  const Field = seam?.Field ?? TurnstileField;
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const reset = useCallback(() => {
    setToken(null);
    setResetKey((k) => k + 1);
  }, []);
  const element = siteKey ? (
    <Field siteKey={siteKey} onToken={setToken} resetKey={resetKey} />
  ) : null;
  return { token, required: siteKey !== null, element, reset };
}
