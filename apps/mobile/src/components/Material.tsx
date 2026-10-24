import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Platform,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

/** Blur strength for the pre-iOS 26 tier; clear is lighter so the photo shows. */
const BLUR_INTENSITY = { regular: 80, clear: 40 } as const;

export type MaterialVariant = 'regular' | 'clear';
export type MaterialTier = 'glass' | 'blur' | 'solid';

/**
 * Picks the surface a floating control can render (design/system.md 7.1).
 * Glass on iOS 26+, blur on older iOS, and a solid surface on Android and
 * whenever Reduce Transparency is on. Android blur needs a BlurTargetView
 * around the content behind it, so it stays solid until that wiring lands.
 */
export function materialTier(input: {
  os: string;
  glass: boolean;
  reduceTransparency: boolean;
}): MaterialTier {
  if (input.reduceTransparency) return 'solid';
  if (input.os !== 'ios') return 'solid';
  return input.glass ? 'glass' : 'blur';
}

function glassAvailable(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

function useReduceTransparency(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    // iOS only: the setting doesn't exist on Android, and react-native-web
    // has no such API (calling it there throws).
    if (Platform.OS !== 'ios') return;
    let alive = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((v) => {
        if (alive) setOn(v);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}

type Props = Omit<ViewProps, 'style'> & {
  children?: ReactNode;
  /** `regular` for chrome on the page; `clear` for buttons over a photo. */
  variant?: MaterialVariant;
  style?: StyleProp<ViewStyle>;
};

/**
 * The floating layer (navigation chrome only, never content). One material
 * per stack: what sits on it uses fills or plain ink, never another Material.
 */
export function Material({ children, variant = 'regular', style, ...rest }: Props) {
  const { rt } = useUnistyles();
  const reduceTransparency = useReduceTransparency();
  const tier = materialTier({
    os: Platform.OS,
    glass: glassAvailable(),
    reduceTransparency,
  });
  const dark = rt.themeName === 'dark';

  if (tier === 'glass') {
    return (
      <GlassView
        glassEffectStyle={variant}
        colorScheme={dark ? 'dark' : 'light'}
        style={[styles.clip, style]}
        {...rest}
      >
        {children}
      </GlassView>
    );
  }
  if (tier === 'blur') {
    return (
      <BlurView
        intensity={BLUR_INTENSITY[variant]}
        tint={variant === 'clear' ? 'dark' : 'systemChromeMaterial'}
        style={[styles.clip, styles.edge(variant), style]}
        {...rest}
      >
        {children}
      </BlurView>
    );
  }
  return (
    <View style={[styles.clip, styles.solid(variant), styles.edge(variant), style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  clip: { overflow: 'hidden' },
  solid: (variant: MaterialVariant) => ({
    backgroundColor: variant === 'clear' ? theme.colors.materialClear : theme.colors.materialSolid,
  }),
  edge: (variant: MaterialVariant) => ({
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: variant === 'clear' ? 'transparent' : theme.colors.materialHairline,
  }),
}));
