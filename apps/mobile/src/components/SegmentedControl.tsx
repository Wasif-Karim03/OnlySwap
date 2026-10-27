import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { CountPill } from './Badge';
import { Text } from './Text';
import { a11yState } from '@/lib/a11y';

type Props<T extends string> = {
  label: string;
  /**
   * `badge`: a small red count after the label (Inbox "Selling 2", DEC 90);
   * `badgeLabel` is what screen readers hear for it, e.g. "2 need you".
   */
  segments: { value: T; label: string; badge?: number; badgeLabel?: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Track color: `bg2` on white screens, `bg3` on grey (bg2) screens. */
  surface?: 'bg2' | 'bg3';
};

/** Pressed segments dim, like tabs; nothing moves (DESIGN_REVIEW 3.08). */
const PRESSED_OPACITY = 0.6;

/** 2 to 4 segments (DESIGN_SYSTEM §6). */
export function SegmentedControl<T extends string>({
  label,
  segments,
  value,
  onChange,
  surface = 'bg2',
}: Props<T>) {
  if (segments.length < 2 || segments.length > 4) {
    throw new Error('SegmentedControl takes 2 to 4 segments');
  }
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={styles.track(surface)}>
      {segments.map((s) => {
        const selected = s.value === value;
        const badge = s.badge && s.badge > 0 ? s.badge : null;
        return (
          <Pressable
            key={s.value}
            accessibilityRole="tab"
            accessibilityLabel={
              badge !== null ? `${s.label}, ${s.badgeLabel ?? String(badge)}` : s.label
            }
            {...a11yState({ selected })}
            onPress={() => onChange(s.value)}
            style={({ pressed }) => [styles.segment(selected), pressed && styles.pressed]}
          >
            <Text variant="label" tone={selected ? 'inverse' : 'ink2'}>
              {s.label}
            </Text>
            <CountPill count={s.badge} hidden={false} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  track: (surface: 'bg2' | 'bg3') => ({
    flexDirection: 'row',
    padding: theme.space.xs,
    gap: theme.space.xs,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors[surface],
  }),
  segment: (selected: boolean) => ({
    flex: 1,
    flexDirection: 'row',
    gap: theme.space.xs,
    // 44 pt target (3.08): the old 36 pt segment had no slop.
    minHeight: theme.size.buttonM,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.chip,
    // Ink fill like Chip and the tab bar pill: a card fill on bg2 was 1.11:1,
    // so the chosen segment couldn't be told apart (UX audit 2026-10-25).
    backgroundColor: selected ? theme.colors.ink : 'transparent',
  }),
  pressed: { opacity: PRESSED_OPACITY },
}));
