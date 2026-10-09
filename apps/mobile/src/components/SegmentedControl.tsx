import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from './Text';

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
            accessibilityState={{ selected }}
            onPress={() => onChange(s.value)}
            style={styles.segment(selected)}
          >
            <Text variant="label" tone={selected ? 'ink' : 'ink2'}>
              {s.label}
            </Text>
            {badge !== null ? (
              <View style={styles.badge}>
                <Text variant="meta" tone="inverse" overlay>
                  {badge > 99 ? '99+' : String(badge)}
                </Text>
              </View>
            ) : null}
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
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors[surface],
  }),
  segment: (selected: boolean) => ({
    flex: 1,
    flexDirection: 'row',
    gap: theme.space.xs,
    minHeight: theme.size.buttonS,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.control - theme.space.xs,
    backgroundColor: selected ? theme.colors.card : 'transparent',
  }),
  badge: {
    minWidth: theme.size.badge,
    paddingHorizontal: theme.space.xs,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    backgroundColor: theme.colors.red,
  },
}));
