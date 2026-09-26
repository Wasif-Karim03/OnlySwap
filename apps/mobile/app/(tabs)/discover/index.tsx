import { ShellScreen } from '@/components/ShellScreen';
import { shell } from '@/strings/en';

export default function DiscoverScreen() {
  return <ShellScreen testID="screen-discover" title={shell.discoverTitle} />;
}
