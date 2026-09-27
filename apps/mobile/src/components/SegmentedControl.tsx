import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from './Text';

type Props<T extends string> = {
  label: string;
  segments: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** 2 to 4 segments (DESIGN_SYSTEM §6). */
export function SegmentedControl<T extends string>({ label, segments, value, onChange }: Props<T>) {
  if (segments.length < 2 || segments.length > 4) {
    throw new Error('SegmentedControl takes 2 to 4 segments');
  }
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={styles.track}>
      {segments.map((s) => {
        const selected = s.value === value;
        return (
          <Pressable
            key={s.value}
            accessibilityRole="tab"
            accessibilityLabel={s.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(s.value)}
            style={styles.segment(selected)}
          >
            <Text variant="label" tone={selected ? 'ink' : 'ink2'}>
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  track: {
    flexDirection: 'row',
    padding: theme.space.xs,
    gap: theme.space.xs,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.bg2,
  },
  segment: (selected: boolean) => ({
    flex: 1,
    minHeight: theme.size.buttonS,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.control - theme.space.xs,
    backgroundColor: selected ? theme.colors.card : 'transparent',
  }),
}));
