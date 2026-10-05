import { useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { errorCopy, toAppError } from '@/lib/errors';
import { sheet as sheetCopy } from '@/strings';

import { Button } from './Button';
import { Sheet } from './Sheet';
import { Text } from './Text';

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  /** A verb: "Delete listing", "Sign out". */
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** May return a promise; the button spins until it settles. Close by setting `visible`. */
  onConfirm: () => unknown;
  onCancel: () => void;
  campusTimeZone?: string;
  testID?: string;
};

/**
 * Confirmation for irreversible or costly actions (P2-CMP-11). A bottom sheet,
 * so it keeps the Sheet's focus trap and Android back. If the action fails, the
 * error shows inline and the dialog stays open.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = sheetCopy.cancel,
  destructive = false,
  onConfirm,
  onCancel,
  campusTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
  testID,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  // Opening again starts clean.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setError(null);
  }

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(errorCopy(toAppError(e), { campusTimeZone }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={busy ? () => {} : onCancel} title={title} testID={testID}>
      {message ? (
        <Text variant="body" tone="ink2">
          {message}
        </Text>
      ) : null}
      {error ? (
        <Text variant="label" tone="red" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          label={confirmLabel}
          variant={destructive ? 'destructive' : 'dark'}
          loading={busy}
          onPress={confirm}
        />
        <Button label={cancelLabel} variant="secondary" disabled={busy} onPress={onCancel} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  actions: { gap: theme.space.sm, marginTop: theme.space.xs },
}));
