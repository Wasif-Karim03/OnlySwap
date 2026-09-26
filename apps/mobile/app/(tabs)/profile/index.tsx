import { Link } from 'expo-router';

import { ShellScreen } from '@/components/ShellScreen';
import { dev } from '@/strings/en';

export default function ProfileScreen() {
  return (
    <>
      <ShellScreen testID="screen-profile" />
      {__DEV__ ? (
        <Link href="/dev/spikes" accessibilityRole="link" accessibilityHint={dev.openHint}>
          {dev.open}
        </Link>
      ) : null}
    </>
  );
}
