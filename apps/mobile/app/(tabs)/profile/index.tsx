import { Link } from 'expo-router';
import { Pressable } from 'react-native';

import { Text } from '@/components/Text';
import { ProfileTabScreen } from '@/features/me/MeScreens';
import { dev, kit } from '@/strings';

export default function ProfileRoute() {
  return (
    <ProfileTabScreen
      devLinks={
        __DEV__ ? (
          <>
            <Link href="/dev/kit" asChild>
              <Pressable accessibilityRole="link">
                <Text variant="label" tone="ink2">
                  {kit.open}
                </Text>
              </Pressable>
            </Link>
            <Link href="/dev/spikes" asChild>
              <Pressable accessibilityRole="link" accessibilityHint={dev.openHint}>
                <Text variant="label" tone="ink2">
                  {dev.open}
                </Text>
              </Pressable>
            </Link>
          </>
        ) : null
      }
    />
  );
}
