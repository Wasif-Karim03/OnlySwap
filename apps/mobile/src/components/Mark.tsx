import Svg, { Path } from 'react-native-svg';
import { useUnistyles } from 'react-native-unistyles';

/** The Handoff mark (Q6 default), same paths as the board and the app icon. */
export const HANDOFF_PATHS = ['M45 14a32 32 0 0 0 0 64z', 'M55 22a32 32 0 0 1 0 64z'] as const;

/** `accent` is a fill (the board's mark on photos and on the Welcome hero), never text. */
type Props = {
  size?: number;
  tone?: 'ink' | 'onAccent' | 'inverse' | 'accent';
  accessibilityLabel?: string;
};

export function Mark({ size = 32, tone = 'ink', accessibilityLabel }: Props) {
  const { theme } = useUnistyles();
  const color = tone === 'inverse' ? theme.colors.bg : theme.colors[tone];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
    >
      {HANDOFF_PATHS.map((d) => (
        <Path key={d} d={d} fill={color} />
      ))}
    </Svg>
  );
}
