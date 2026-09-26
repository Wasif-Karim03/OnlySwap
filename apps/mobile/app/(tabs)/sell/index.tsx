import { ShellScreen } from '@/components/ShellScreen';
import { shell } from '@/strings/en';

export default function SellScreen() {
  return <ShellScreen testID="screen-sell" title={shell.sellTitle} />;
}
