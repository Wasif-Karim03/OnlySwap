import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { Icon } from '@/components/icons/Icon';
import { Tag } from '@/components/Tag';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { errorText } from '@/lib/errors';
import { fill } from '@/lib/format';
import { meetup as copy } from '@/strings/en';

import type { MeetupsApi } from './api';
import { placeOf, whenLabel, type Meetup } from './logic';

/**
 * MeetupCard (P8-MEET-04; DESIGN_SYSTEM §6): proposed / confirmed / changed /
 * cancelled, with inline Accept and Suggest another for the other side.
 */
export function MeetupCard({
  meetup: m,
  chatId,
  otherName,
  api,
  onChanged,
  now = () => new Date(),
}: {
  meetup: Meetup;
  chatId: string;
  otherName: string;
  api: Pick<MeetupsApi, 'confirm'>;
  onChanged: () => void;
  now?: () => Date;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const when = whenLabel(m.starts_at, now());
  const place = placeOf(m);

  const title =
    m.status === 'proposed'
      ? m.proposed_by_me
        ? fill(copy.youSuggested, { when, place, name: otherName })
        : fill(copy.theySuggested, { name: otherName, when, place })
      : m.status === 'confirmed'
        ? fill(copy.cardConfirmed, { when })
        : m.status === 'cancelled'
          ? copy.cardCancelled
          : m.status === 'completed'
            ? copy.cardDone
            : copy.cardNoShow;

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.confirm(m.id);
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <View style={styles.card} testID={`meetup-card-${m.status}`}>
      <View style={styles.row}>
        <Icon name="pin" size={20} tone="ink" />
        <Text variant="bodyStrong" style={styles.flex}>
          {title}
        </Text>
      </View>
      {m.status === 'confirmed' || m.status === 'proposed' ? (
        <View style={styles.row}>
          <Text variant="meta" tone="ink2" style={styles.flex}>
            {place}
          </Text>
          {m.spot?.police ? <Tag label={copy.police} tone="green" /> : null}
        </View>
      ) : null}
      {error ? (
        <Text variant="meta" tone="red">
          {error}
        </Text>
      ) : null}
      {m.status === 'proposed' && !m.proposed_by_me ? (
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button
              label={copy.accept}
              size="M"
              loading={busy}
              onPress={accept}
              testID="meetup-accept"
            />
          </View>
          <View style={styles.flex}>
            <Button
              label={copy.suggestAnother}
              size="M"
              variant="secondary"
              onPress={() => router.push({ pathname: '/chat/[id]/meetup', params: { id: chatId } })}
              testID="meetup-suggest-another"
            />
          </View>
        </View>
      ) : null}
    </View>
  );

  if (m.status === 'confirmed') {
    return (
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${place}. ${copy.open}`}
        onPress={() =>
          router.push({ pathname: '/meetup/[id]', params: { id: m.id, name: otherName } })
        }
        testID="meetup-card-open"
      >
        {body}
      </Tappable>
    );
  }
  return body;
}

const styles = StyleSheet.create((theme) => ({
  card: {
    marginHorizontal: theme.space.screen,
    marginVertical: theme.space.sm,
    padding: theme.space.md,
    gap: theme.space.sm,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.card,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  actions: { flexDirection: 'row', gap: theme.space.sm },
  flex: { flex: 1 },
}));
