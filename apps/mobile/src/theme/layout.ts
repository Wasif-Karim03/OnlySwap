import { space } from '@onlyswap/tokens';
import { useWindowDimensions } from 'react-native';

/**
 * Width-based layout (P17-FEAT-02, board N5/N6). One rule for iPhone, iPad
 * in either orientation, Split View and Slide Over: the window width picks
 * the size class, never the device model.
 *
 * - `compact` (< 600): phones and narrow iPad split panes. The phone layout.
 * - `regular` (600 to 1023): iPad portrait and half splits. Phone layout,
 *   content held to a readable column, the swipe card capped.
 * - `wide` (>= 1024): iPad landscape and 13-inch portrait. Sidebar instead of
 *   the tab bar, a grid instead of swiping (N5), two-pane Inbox (N6), listing
 *   photos beside the details.
 *
 * Phone widths (<= 440 pt) sit below every max width here, so nothing changes
 * on a phone. These sizes are layout limits, not design tokens; they move to
 * `packages/tokens` (size.*) if the board gets an iPad token sheet.
 */
export const LAYOUT = {
  /** Size class breakpoints (window width in pt). */
  regularMin: 600,
  wideMin: 1024,
  /** Forms, settings, onboarding and legal text. */
  readableMax: 640,
  /** Quad and Around campus feeds. */
  feedMax: 680,
  /** The swipe card; swipe math follows the card's measured width. */
  deckMax: 520,
  /** Sheets float as a centered card this wide on iPad. */
  sheetMax: 560,
  /** Sidebar on wide (board N5/N6 `aside`). */
  railWidth: 230,
  /** Inbox list pane on wide (board N6). */
  inboxListWidth: 330,
  /** Smallest listing tile before the grid drops a column. */
  tileMin: 220,
  /** Grid columns are clamped to this range. */
  minColumns: 2,
  maxColumns: 5,
} as const;

export type SizeClass = 'compact' | 'regular' | 'wide';

export type Layout = {
  width: number;
  height: number;
  size: SizeClass;
  /** iPad-sized window (regular or wide). */
  tablet: boolean;
  /** Sidebar instead of the bottom tab bar, grid Discover, two-pane Inbox. */
  wide: boolean;
};

/** Size class for a window width. */
export function sizeClass(width: number): SizeClass {
  if (width >= LAYOUT.wideMin) return 'wide';
  if (width >= LAYOUT.regularMin) return 'regular';
  return 'compact';
}

/** Layout facts for a window size (pure, for tests and non-hook callers). */
export function layoutFor(width: number, height = 0): Layout {
  const size = sizeClass(width);
  return { width, height, size, tablet: size !== 'compact', wide: size === 'wide' };
}

/** Current layout; updates on rotation and Split View resizes. */
export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return layoutFor(width, height);
}

/**
 * Listing grid columns for the width a grid gets: 2 on phones, then as many
 * `tileMin` tiles as fit, clamped to 2..5.
 */
export function gridColumns(width: number, opts: { padding?: number; gap?: number } = {}): number {
  const padding = opts.padding ?? space.screen;
  const gap = opts.gap ?? space.md;
  if (sizeClass(width) === 'compact') return LAYOUT.minColumns;
  const fit = Math.floor((width - padding * 2 + gap) / (LAYOUT.tileMin + gap));
  return Math.min(LAYOUT.maxColumns, Math.max(LAYOUT.minColumns, fit));
}

/** Width of one grid cell, so a short last row keeps the same tile size. */
export function gridCellWidth(
  width: number,
  columns: number,
  opts: { padding?: number; gap?: number } = {},
): number {
  const padding = opts.padding ?? space.screen;
  const gap = opts.gap ?? space.md;
  return Math.max(0, Math.floor((width - padding * 2 - gap * (columns - 1)) / columns));
}

/** Centered column, full width on phones. Spread into a style. */
export const readableColumn = {
  width: '100%',
  maxWidth: LAYOUT.readableMax,
  alignSelf: 'center',
} as const;

export const feedColumn = {
  flex: 1,
  width: '100%',
  maxWidth: LAYOUT.feedMax,
  alignSelf: 'center',
} as const;
