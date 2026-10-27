import { fontScale as fontScaleTokens, type TypeVariant } from '@onlyswap/tokens';
import {
  Platform,
  Text as RNText,
  useWindowDimensions,
  type TextProps as RNTextProps,
} from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/** Text colors allowed for type. `accent` is deliberately absent (UX-03). */
/** `inverse` is the screen background color, for text on ink or red fills. */
/** `onPhoto` is white in both modes, for text on a photo scrim or the dark photo viewer. */
/**
 * `sky`, `peach` and `lilac` text only inside their own tinted chip or Tag
 * (4.5:1 is guaranteed on `*Bg` only), never on a plain screen. `lilac` is
 * retired (DEC 142): no new uses.
 */
export type TextTone =
  | 'ink'
  | 'ink2'
  | 'ink3'
  | 'red'
  | 'green'
  | 'amber'
  | 'sky'
  | 'peach'
  | 'lilac'
  | 'onAccent'
  | 'inverse'
  | 'onPhoto';

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  tone?: TextTone;
  /**
   * Text drawn over photos, in the tab bar or in fixed-size chrome (OTP cells,
   * avatar initials, badges): Dynamic Type capped at 1.4x (DESIGN_SYSTEM §3, DEC 142).
   */
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
      // Android's default 'highQuality' line breaking can measure a wrapped line
      // narrower than it draws, so the last line of a chat bubble was cut off on
      // a Samsung phone (owner device check, 2026-10-15). 'simple' measures and
      // draws the same way.
      textBreakStrategy={Platform.OS === 'android' ? 'simple' : undefined}
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
      // Unistyles on web hands theme arrays over in another form; only spread a real array.
      fontVariant:
        'fontVariant' in t && Array.isArray(t.fontVariant) ? [...t.fontVariant] : undefined,
      color: tone === 'inverse' ? theme.colors.bg : theme.colors[tone],
    };
  },
}));
