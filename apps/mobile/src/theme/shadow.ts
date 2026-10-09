import { elevation } from '@onlyswap/tokens';

/**
 * A small lift for floating circles (photo buttons, the deck's Pass button,
 * DEC 90): the `elevation.soft` color and opacity at a quarter of its offset
 * and a third of its blur. Built as `boxShadow`, which React Native's New
 * Architecture and the web both draw the same way; the older `shadow*` props
 * rendered as a hard, dark ring on web.
 */
export function liftShadow(): { boxShadow: string } {
  const { color, opacity, offsetY, blur } = elevation.soft;
  const alpha = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, '0');
  const y = Math.round(offsetY / 4);
  const r = Math.round(blur / 3);
  return { boxShadow: `0px ${y}px ${r}px ${color}${alpha}` };
}
