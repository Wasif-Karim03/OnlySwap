import { ShellScreen } from '@/components/ShellScreen';
import { shell } from '@/strings/en';

export default function InboxScreen() {
  return <ShellScreen testID="screen-inbox" title={shell.inboxTitle} />;
}
