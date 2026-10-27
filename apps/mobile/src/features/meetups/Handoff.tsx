import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Text } from '@/components/Text';
import { useToastStore } from '@/components/Toast';
import { track } from '@/lib/analytics';
import { errorText } from '@/lib/errors';
import { fill } from '@/lib/format';
import { meetup as copy } from '@/strings';
import { chatKey } from '../chat/logic';
import type { MeetupsApi } from './api';
import type { Meetup } from './logic';

/** Only digits, at most 4: what the seller can type as the buyer's code. */
export function cleanHandoffCode(text: string): string {
  return text.replace(/\D/g, '').slice(0, 4);
}

/**
 * DEC 132 handoff code on a confirmed meetup. The buyer sees their 4-digit
 * code; the seller types it to finish the swap (both done, sold, rate). The
 * server counts wrong tries and locks after 5; "Did it sell?" still works.
 */
/** The buyer's code shows from this long before the start (UX audit 2026-10-25). */
export const HANDOFF_REVEAL_MS = 30 * 60_000;

/**
 * Shown days early, the code could be talked out of the buyer in chat and
 * the swap marked done before anything changed hands.
 */
export function handoffVisible(startsAt: string, now: Date): boolean {
  return new Date(startsAt).getTime() - now.getTime() <= HANDOFF_REVEAL_MS;
}

export function Handoff({
  meetup: m,
  api,
  onDone,
  now = new Date(),
}: {
  meetup: Meetup;
  api: Pick<MeetupsApi, 'confirmHandoff'>;
  onDone: () => Promise<unknown>;
  now?: Date;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (m.status !== 'confirmed' || m.handoff_at) return null;

  if (!m.i_am_seller) {
    if (!m.handoff_code) return null;
    if (!handoffVisible(m.starts_at, now)) {
      return (
        <View style={styles.panel} testID="meetup-handoff-later">
          <Text variant="label" tone="ink3">
            {copy.handoffTitle}
          </Text>
          <Text variant="meta" tone="ink2">
            {copy.handoffLater}
          </Text>
        </View>
      );
    }
    return (
      <View
        style={styles.panel}
        accessible
        accessibilityLabel={`${copy.handoffTitle}: ${m.handoff_code.split('').join(' ')}. ${copy.handoffBuyer}`}
        testID="meetup-handoff-code"
      >
        <Text variant="label" tone="ink3">
          {copy.handoffTitle}
        </Text>
        <Text variant="display" style={styles.code}>
          {m.handoff_code}
        </Text>
        <Text variant="meta" tone="ink2">
          {copy.handoffBuyer}
        </Text>
      </View>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.confirmHandoff(m.id, code);
      if (!r.ok) {
        setError(fill(copy.handoffWrong, { n: r.tries_left }));
        setCode('');
        return;
      }
      track('deal_confirmed', { outcome: 'done' });
      useToastStore.getState().show('success', copy.handoffDone);
      void qc.invalidateQueries({ queryKey: chatKey(m.chat_id) });
      void qc.invalidateQueries({ queryKey: ['inbox'] });
      await onDone();
      router.replace({ pathname: '/deal/[chatId]/rate', params: { chatId: m.chat_id } });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.panel} testID="meetup-handoff-entry">
      <Text variant="bodyStrong">{copy.handoffSellerTitle}</Text>
      <Text variant="meta" tone="ink2">
        {copy.handoffSellerBody}
      </Text>
      <Input
        label={copy.handoffLabel}
        value={code}
        onChangeText={(t) => setCode(cleanHandoffCode(t))}
        keyboardType="number-pad"
        maxLength={4}
        textContentType="oneTimeCode"
        testID="meetup-handoff-input"
      />
      {error ? <Banner kind="error" message={error} /> : null}
      <Button
        label={copy.handoffConfirm}
        onPress={submit}
        loading={busy}
        disabled={code.length !== 4 || busy}
        testID="meetup-handoff-confirm"
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  panel: {
    gap: theme.space.sm,
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.card,
  },
  code: { letterSpacing: theme.space.sm },
}));
