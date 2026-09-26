import { ShellScreen } from '@/components/ShellScreen';
import { shell } from '@/strings/en';

export default function ProfileScreen() {
  return <ShellScreen testID="screen-profile" title={shell.profileTitle} />;
}
