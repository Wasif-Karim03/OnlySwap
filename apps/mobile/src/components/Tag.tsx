import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text, type TextTone } from './Text';

export type TagTone = 'neutral' | 'accent' | 'green' | 'amber' | 'red';

const TEXT: Record<TagTone, TextTone> = {
  neutral: 'ink2',
  accent: 'onAccent',
  green: 'green',
  amber: 'amber',
  red: 'red',
};

/** Small status label. Accent tag is an accent fill with onAccent text (never accent text). */
export function Tag({ label, tone = 'neutral' }: { label: string; tone?: TagTone }) {
  return (
    <View style={styles.tag(tone)}>
      <Text variant="meta" tone={TEXT[tone]} style={styles.text}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  tag: (tone: TagTone) => ({
    alignSelf: 'flex-start',
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xs / 2,
    borderRadius: theme.radius.chip,
    backgroundColor:
      tone === 'accent'
        ? theme.colors.accent
        : tone === 'green'
          ? theme.colors.greenBg
          : tone === 'amber'
            ? theme.colors.amberBg
            : tone === 'red'
              ? theme.colors.redBg
              : theme.colors.bg2,
  }),
  text: { fontWeight: '600' },
}));
