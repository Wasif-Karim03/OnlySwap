import { Link } from 'expo-router';
import { Pressable } from 'react-native';

import { ShellScreen } from '@/components/ShellScreen';
import { Text } from '@/components/Text';
import { dev, kit } from '@/strings/en';

export default function ProfileScreen() {
  return (
    <>
      <ShellScreen testID="screen-profile" />
      {__DEV__ ? (
        <Link href="/dev/kit" asChild>
          <Pressable accessibilityRole="link">
            <Text variant="label" tone="ink2">
              {kit.open}
            </Text>
          </Pressable>
        </Link>
      ) : null}
      {__DEV__ ? (
        <Link href="/dev/spikes" asChild>
          <Pressable accessibilityRole="link" accessibilityHint={dev.openHint}>
            <Text variant="label" tone="ink2">
              {dev.open}
            </Text>
          </Pressable>
        </Link>
      ) : null}
    </>
  );
}
