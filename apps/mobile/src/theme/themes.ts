/**
 * Light and dark themes (DESIGN_SYSTEM §2). This is the only file with raw
 * color values; components read them through Unistyles. P2-TOK-01 (S4)
 * replaces this file with values generated from packages/tokens.
 */
export const lightTheme = {
  colors: {
    bg: '#FFFFFF',
    bg2: '#F3F3F0',
    line: '#E6E6E1',
    ink: '#111110',
    ink2: '#5A5A54',
    accent: '#C8E27D',
    onAccent: '#111110',
  },
  space: (n: number) => n * 4,
} as const;

export const darkTheme = {
  colors: {
    bg: '#0C0C0D',
    bg2: '#1A1A1C',
    line: '#28282B',
    ink: '#F3F3EF',
    ink2: '#A6A69F',
    accent: '#C8E27D',
    onAccent: '#0C0C0D',
  },
  space: (n: number) => n * 4,
} as const;
