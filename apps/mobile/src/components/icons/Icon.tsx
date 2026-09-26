import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useUnistyles } from 'react-native-unistyles';

import { iconData, type IconName } from './iconData';

export type { IconName };

type Props = {
  name: IconName;
  size?: number;
  /** Theme color key. Never `accent` on light backgrounds (UX-03). */
  tone?: 'ink' | 'ink2' | 'ink3' | 'red' | 'green' | 'amber' | 'onAccent' | 'inverse';
};

/** Stroke icon from the board (24x24, 1.8 px, round caps). Decorative by default. */
export function Icon({ name, size = 22, tone = 'ink' }: Props) {
  const { theme } = useUnistyles();
  const color = tone === 'inverse' ? theme.colors.bg : theme.colors[tone];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {iconData[name].map((s, i) => {
        if (s.tag === 'path') return <Path key={i} d={s.d} strokeWidth={s.strokeWidth} />;
        if (s.tag === 'rect')
          return (
            <Rect
              key={i}
              x={s.x}
              y={s.y}
              width={s.width}
              height={s.height}
              rx={s.rx}
              strokeWidth={s.strokeWidth}
            />
          );
        return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} strokeWidth={s.strokeWidth} />;
      })}
    </Svg>
  );
}
