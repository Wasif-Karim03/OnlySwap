/**
 * Cloudflare Turnstile on the web build (LR-04, DEC 139). The signed-out
 * forms (Help, Email access, waitlist) send a `turnstile_token` that
 * support-request and waitlist-request verify. Native apps send no token and
 * their request bodies are unchanged. Pure and injectable so Jest can drive
 * it without a browser.
 */
import { EnvError } from './env';
import { toAppError } from './errors';

export const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const SCRIPT_ID = 'cf-turnstile-api';

type RenderOptions = {
  sitekey: string;
  appearance: 'interaction-only';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
};

/** The parts of `window.turnstile` the app uses. */
export type TurnstileApi = {
  render: (el: unknown, options: RenderOptions) => string | undefined;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

type ScriptLike = {
  id: string;
  src: string;
  async: boolean;
  defer: boolean;
  addEventListener: (type: 'load' | 'error', cb: () => void) => void;
};

export type WindowLike = { turnstile?: TurnstileApi };
export type DocumentLike = {
  getElementById: (id: string) => unknown;
  createElement: (tag: 'script') => ScriptLike;
  head: { appendChild: (el: ScriptLike) => unknown };
};

/**
 * The site key on the web build, null on native. The web build always needs
 * one: a missing key throws instead of silently sending no token (IR4-04).
 */
export function turnstileSiteKey(
  env: { EXPO_PUBLIC_TURNSTILE_SITE_KEY?: string },
  os: string,
): string | null {
  if (os !== 'web') return null;
  if (!env.EXPO_PUBLIC_TURNSTILE_SITE_KEY) {
    throw new EnvError(
      'EXPO_PUBLIC_TURNSTILE_SITE_KEY is missing: the web build needs the Turnstile site key (LR-04)',
    );
  }
  return env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
}

/** Injects the Turnstile script once and resolves with `window.turnstile`. */
export function loadTurnstile(win: WindowLike, doc: DocumentLike): Promise<TurnstileApi> {
  if (win.turnstile) return Promise.resolve(win.turnstile);
  return new Promise((resolve, reject) => {
    let script = doc.getElementById(SCRIPT_ID) as ScriptLike | null;
    if (!script) {
      script = doc.createElement('script');
      script.id = SCRIPT_ID;
      script.src = TURNSTILE_SCRIPT;
      script.async = true;
      script.defer = true;
      doc.head.appendChild(script);
    }
    script.addEventListener('load', () =>
      win.turnstile ? resolve(win.turnstile) : reject(new Error('turnstile missing')),
    );
    script.addEventListener('error', () => reject(new Error('turnstile failed to load')));
  });
}

export type TurnstileWidget = { reset: () => void; remove: () => void };

/**
 * Renders the widget (shown only when Cloudflare needs an interaction).
 * `onToken` gets the token, or null when it expires, errors or is reset.
 */
export function mountTurnstile(
  api: TurnstileApi,
  el: unknown,
  siteKey: string,
  onToken: (token: string | null) => void,
): TurnstileWidget {
  const id = api.render(el, {
    sitekey: siteKey,
    appearance: 'interaction-only',
    callback: (token) => onToken(token),
    'expired-callback': () => onToken(null),
    'error-callback': () => onToken(null),
  });
  return {
    reset: () => {
      onToken(null);
      if (id !== undefined) api.reset(id);
    },
    remove: () => {
      if (id !== undefined) api.remove(id);
    },
  };
}

/** The server rejected the bot check (`INVALID:turnstile_token`). */
export function isTurnstileError(error: unknown): boolean {
  const e = toAppError(error);
  return e.code === 'INVALID' && e.detail === 'turnstile_token';
}
