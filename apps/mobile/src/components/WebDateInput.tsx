import { createElement, useState } from 'react';
import { useUnistyles } from 'react-native-unistyles';

/**
 * The system UI font stack. The page body has no font of its own (only
 * react-native-web's text nodes do), so a bare `<input>` would fall back to
 * the browser's serif default (DEC 90). Same stack react-native-web uses
 * for `System`.
 */
export const SYSTEM_FONT_STACK =
  '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

/** `YYYY-MM-DD` for a local date (the value format of `<input type="date">`). */
export function isoDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** A local Date from `YYYY-MM-DD`, or null for an empty or impossible value. */
export function parseIsoDay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isoDay(d) === value ? d : null;
}

/**
 * Web-only date field (P13-WEB-07): the browser's own date input, used where
 * the phone app shows the native date wheels (A05 age check). Render it only
 * when `Platform.OS === 'web'`; react-native-web renders DOM elements, native
 * doesn't. Styled from theme tokens to match `Input`: the 2 px ink border
 * is the focus ring, so the page's outline is turned off for it
 * (`data-focus-ring`, public/index.html).
 */
export function WebDateInput({
  value,
  max,
  onChange,
  label,
  testID,
}: {
  value: Date | null;
  max: Date;
  onChange: (date: Date | null) => void;
  label: string;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const [focused, setFocused] = useState(false);
  return createElement('input', {
    type: 'date',
    value: value ? isoDay(value) : '',
    max: isoDay(max),
    'aria-label': label,
    'data-testid': testID,
    'data-focus-ring': 'app',
    onChange: (e: { target: { value: string } }) => onChange(parseIsoDay(e.target.value)),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      boxSizing: 'border-box',
      width: '100%',
      minHeight: theme.size.buttonL,
      paddingLeft: theme.space.lg,
      paddingRight: theme.space.lg,
      borderRadius: theme.radius.control,
      borderWidth: 2,
      borderStyle: 'solid',
      borderColor: focused ? theme.colors.ink : 'transparent',
      backgroundColor: focused ? theme.colors.card : theme.colors.bg2,
      color: theme.colors.ink,
      fontFamily: SYSTEM_FONT_STACK,
      outline: 'none',
      fontSize: theme.type.body.fontSize,
      colorScheme: theme.mode,
    },
  });
}
