import { Image } from 'expo-image';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { avatarShade, initials } from '@/components/Avatar';
import { imageStyles } from '@/components/Photo';
import { Text } from '@/components/Text';

const TINTS = ['lilac', 'peach', 'sky'] as const;
type Tint = (typeof TINTS)[number];

/**
 * The other person in a deal (DEC 90): their photo, or their first initial on
 * a soft tint that stays the same for the same name. `badge` is the small one
 * that sits on the corner of an item photo in the Inbox; `row` sits in a list
 * row. Decorative: the row reads the name.
 */
export function DealAvatar({
  name,
  uri,
  size = 'row',
}: {
  name: string;
  uri?: string | null;
  size?: 'badge' | 'row';
}) {
  const tint: Tint = TINTS[avatarShade(name)];
  return (
    <View
      style={styles.circle(size, tint)}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={imageStyles.image}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text variant={size === 'badge' ? 'meta' : 'label'} tone={tint} overlay>
          {initials(name).slice(0, 1)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  circle: (size: 'badge' | 'row', tint: Tint) => {
    const side = size === 'badge' ? theme.size.avatarS * 0.75 : theme.size.avatarS;
    return {
      width: side,
      height: side,
      borderRadius: theme.radius.avatar,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors[`${tint}Bg`],
    };
  },
}));
