import { useEffect } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { usePermissionPrimer, type PermissionKind } from '@/lib/permissions';
import { primer as primerCopy } from '@/strings';

import { Button } from './Button';
import { GlyphTile } from './EmptyState';
import type { IconName } from './icons/Icon';
import { NavBar } from './NavBar';
import { Text } from './Text';

const ICON: Record<PermissionKind, IconName> = {
  camera: 'camera',
  photos: 'image',
  notifications: 'bell',
};

type ViewProps = {
  kind: PermissionKind;
  /** `primer` before asking; `settings` after the OS said no for good (board X18 / X21). */
  step: 'primer' | 'settings';
  onContinue: () => void;
  onOpenSettings: () => void;
  /** The other way forward, e.g. "Choose from library instead" or "Not now". */
  onAlternative?: () => void;
  onClose?: () => void;
  busy?: boolean;
  testID?: string;
};

/**
 * The primer screen without the OS wiring, so the kit and the states gallery
 * can show each step. Per Apple, the primer button says Continue, not Allow.
 */
export function PermissionPrimerView({
  kind,
  step,
  onContinue,
  onOpenSettings,
  onAlternative,
  onClose,
  busy = false,
  testID,
}: ViewProps) {
  const copy = primerCopy[kind];
  const denied = step === 'settings';
  return (
    <View testID={testID} style={styles.screen}>
      <NavBar leading={onClose ? 'close' : 'none'} onLeading={onClose} />
      <View style={styles.body}>
        <GlyphTile icon={ICON[kind]} tile={denied ? 'neutral' : 'accent'} />
        <View style={styles.copy}>
          <Text variant="heading" accessibilityRole="header" style={styles.center}>
            {denied ? copy.deniedTitle : copy.title}
          </Text>
          <Text variant="body" tone="ink2" style={styles.center}>
            {denied ? copy.deniedBody : copy.body}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        {denied ? (
          <Button
            key="settings"
            label={primerCopy.openSettings}
            variant="dark"
            onPress={onOpenSettings}
          />
        ) : (
          <Button key="continue" label={copy.cta} onPress={onContinue} loading={busy} />
        )}
        {onAlternative ? (
          <Button label={copy.alternative} variant="text" onPress={onAlternative} />
        ) : null}
      </View>
    </View>
  );
}

type Props = {
  kind: PermissionKind;
  /** Called once access is granted (right away if it already was). */
  onGranted: () => void;
  onAlternative?: () => void;
  onClose?: () => void;
  testID?: string;
};

/**
 * Permission flow (P2-CMP-10): undetermined → primer → OS prompt; denied for
 * good → Settings. Comes back to the right step after the person returns
 * from Settings. It never prompts on mount.
 */
export function PermissionPrimer({ kind, onGranted, onAlternative, onClose, testID }: Props) {
  const { step, requesting, request, openSettings } = usePermissionPrimer(kind);

  useEffect(() => {
    if (step === 'granted') onGranted();
  }, [step, onGranted]);

  // The check takes a few milliseconds; show a plain screen rather than flash a primer.
  if (step === null || step === 'granted') return <View testID={testID} style={styles.screen} />;

  return (
    <PermissionPrimerView
      testID={testID}
      kind={kind}
      step={step}
      busy={requesting}
      onContinue={() => void request()}
      onOpenSettings={() => void openSettings()}
      onAlternative={onAlternative}
      onClose={onClose}
    />
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.xl,
    paddingHorizontal: theme.space.screen,
  },
  copy: { gap: theme.space.sm, alignItems: 'center', maxWidth: theme.size.copyMax },
  center: { textAlign: 'center' },
  actions: {
    paddingHorizontal: theme.space.screen,
    paddingBottom: rt.insets.bottom + theme.space.lg,
    gap: theme.space.xs,
  },
}));
