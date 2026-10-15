import { useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Sheet } from '@/components/Sheet';
import { TextArea } from '@/components/TextArea';
import { errorText, toAppError } from '@/lib/errors';
import { safety as copy } from '@/strings';

export type AppealReason = keyof typeof copy.appealReasons;

/**
 * Appeal sheet: a reason chip and an optional note (500 chars). `onSend`
 * resolves when the appeal is in; ALREADY_APPEALED counts as sent (DEC 99).
 */
export function AppealSheet({
  visible,
  onClose,
  onSend,
  onSent,
  testID = 'appeal-sheet',
}: {
  visible: boolean;
  onClose: () => void;
  onSend: (reason: AppealReason, body: string) => Promise<void>;
  onSent: () => void;
  testID?: string;
}) {
  const [reason, setReason] = useState<AppealReason>('mistake');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSend(reason, text);
      onSent();
    } catch (e) {
      if (toAppError(e).code === 'ALREADY_APPEALED') onSent();
      else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={copy.appealTitle} testID={testID}>
      <View style={styles.sheet}>
        <View style={styles.chips}>
          {(Object.keys(copy.appealReasons) as AppealReason[]).map((k) => (
            <Chip
              key={k}
              label={copy.appealReasons[k]}
              selected={reason === k}
              onPress={() => setReason(k)}
            />
          ))}
        </View>
        <TextArea
          label={copy.appealBody}
          placeholder={copy.appealPlaceholder}
          value={text}
          onChangeText={setText}
          maxLength={500}
        />
        {error ? <Banner kind="error" message={error} /> : null}
        <Button
          label={copy.appealSend}
          loading={busy}
          onPress={() => void send()}
          testID={`${testID}-send`}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  sheet: { gap: theme.space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
}));
