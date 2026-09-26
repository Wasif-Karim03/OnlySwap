import { defaultAccent, makeTheme, type AccentName } from '@onlyswap/tokens';

/**
 * The single brand accent (DEC-5). The owner picks it (Q6); Pistachio until then.
 * Accent is a fill only, never text on light backgrounds (UX-03).
 */
export const APP_ACCENT: AccentName = defaultAccent;

export const lightTheme = makeTheme('light', APP_ACCENT);
export const darkTheme = makeTheme('dark', APP_ACCENT);
