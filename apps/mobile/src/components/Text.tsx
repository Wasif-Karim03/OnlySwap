import { fontScale as fontScaleTokens, type TypeVariant } from '@onlyswap/tokens';
import { Text as RNText, useWindowDimensions, type TextProps as RNTextProps } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/** Text colors allowed for type. `accent` is deliberately absent (UX-03). */
/** `inverse` is the screen background color, for text on ink or red fills. */
export type TextTone = 'ink' | 'ink2' | 'ink3' | 'red' | 'green' | 'amber' | 'onAccent' | 'inverse';

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  tone?: TextTone;
  /** Text drawn over photos or in the tab bar: Dynamic Type capped at 1.4x (DESIGN_SYSTEM §3). */
  overlay?: boolean;
};

/**
 * The only way to render text (P2-FONT-01). System font (SF Pro / Roboto),
 * DESIGN_SYSTEM §3 scale, font scaling always on.
 */
export function Text({
  variant = 'body',
  tone = 'ink',
  overlay = false,
  style,
  ...rest
}: TextProps) {
  // Re-mount the native text node when the user changes Dynamic Type while the
  // app is running; otherwise iOS keeps the old line boxes and clips glyphs.
  const { fontScale } = useWindowDimensions();
  return (
    <RNText
      key={fontScale}
      allowFontScaling
      maxFontSizeMultiplier={overlay ? fontScaleTokens.overlayMax : undefined}
      style={[styles.text(variant, tone), style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  text: (variant: TypeVariant, tone: TextTone) => {
    const t = theme.type[variant];
    return {
      fontSize: t.fontSize,
      fontWeight: t.fontWeight,
      letterSpacing: t.letterSpacing,
      lineHeight: t.lineHeight,
      fontVariant: 'fontVariant' in t ? [...t.fontVariant] : undefined,
      color: tone === 'inverse' ? theme.colors.bg : theme.colors[tone],
    };
  },
}));
