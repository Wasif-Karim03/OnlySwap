import { Image } from 'expo-image';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { imageStyles } from './Photo';
import { Text } from './Text';

export type AvatarSize = 'S' | 'M' | 'L';

/** Up to two initials from a first name (and last initial if present). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Stable pick from the neutral surface set so every name keeps its color. */
export function avatarShade(name: string): 0 | 1 | 2 {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 3) as 0 | 1 | 2;
}

type Props = {
  name: string;
  uri?: string | null;
  size?: AvatarSize;
  /** `accent`: always the accent fill, e.g. your own profile (DEC 90). */
  fill?: 'shade' | 'accent';
  /** How many initials to show without a photo (2 by default). */
  letters?: 1 | 2;
};

/** Photo avatar, or initials on a token surface. Decorative: the name is read by the row. */
export function Avatar({ name, uri, size = 'M', fill = 'shade', letters = 2 }: Props) {
  const shade = fill === 'accent' ? 2 : avatarShade(name);
  return (
    <View
      style={styles.circle(size, shade)}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={imageStyles.image}
          contentFit="cover"
          transition={150}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text variant={size === 'L' ? 'heading' : 'label'} tone={shade === 2 ? 'onAccent' : 'ink'}>
          {initials(name).slice(0, letters)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  circle: (size: AvatarSize, shade: 0 | 1 | 2) => ({
    width: theme.size[`avatar${size}`],
    height: theme.size[`avatar${size}`],
    borderRadius: theme.radius.avatar,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: [theme.colors.bg2, theme.colors.bg3, theme.colors.accent][shade],
  }),
}));
