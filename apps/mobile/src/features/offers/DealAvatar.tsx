import { Image } from 'expo-image';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { avatarShade, initials } from '@/components/Avatar';
import { imageStyles } from '@/components/Photo';
import { Text } from '@/components/Text';

// Neutral surfaces only (lilac retired; no hue per person). Same name, same shade.
const SURFACES = ['bg2', 'bg3', 'bg2'] as const;
type Surface = (typeof SURFACES)[number];

/**
 * The other person in a deal (DEC 90): their photo, or their first initial on
 * a neutral shade that stays the same for the same name. `badge` is the small one
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
  const surface: Surface = SURFACES[avatarShade(name)];
  return (
    <View
      style={styles.circle(size, surface)}
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
        // Capped at 1.4x: the circle is a fixed size (fixed-size chrome).
        <Text variant={size === 'badge' ? 'meta' : 'label'} tone="ink" overlay>
          {initials(name).slice(0, 1)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  circle: (size: 'badge' | 'row', surface: Surface) => {
    const side = size === 'badge' ? theme.size.avatarS * 0.75 : theme.size.avatarS;
    return {
      width: side,
      height: side,
      borderRadius: theme.radius.avatar,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors[surface],
    };
  },
}));
