import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { track } from '@/lib/analytics';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { IconButton } from '@/components/IconButton';
import { NavBar } from '@/components/NavBar';
import { OptionRow } from '@/components/OptionRow';
import { SkeletonList } from '@/components/Skeleton';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { errorText } from '@/lib/errors';
import { fill } from '@/lib/format';
import { getStorage } from '@/lib/storage';
import type { TypedStorage } from '@/lib/storageCore';
import { meetup as copy } from '@/strings';
import { readableColumn } from '@/theme/layout';

import { sellApi } from '../sell/api';
import { directionsUrl, sortSpots, type Spot } from '../sell/logic';
import { meetupsApi, type MeetupsApi } from './api';
import { dayOptions, timeLabel, timeOptions } from './logic';
import { SpotsMap } from './SpotsMap';

/**
 * E05 Plan the pickup (P8-MEET-02): Meetup spots (police-designated first,
 * with a Directions link), day and time. DEC 151: campus Meetup spots only
 * (no custom places), with a one-time safety reminder. R11-MAP-01
 * adds a collapsible spots map above the list (synced selection); still no
 * location permission, and the list stays the accessible UI.
 */
export function PlanMeetupScreen({
  chatId,
  api = meetupsApi,
  spots = () => sellApi.spots(),
  openUrl = (url: string) => Linking.openURL(url),
  now = () => new Date(),
  store = getStorage(),
}: {
  chatId: string;
  api?: MeetupsApi;
  spots?: () => Promise<Spot[]>;
  openUrl?: (url: string) => Promise<unknown>;
  now?: () => Date;
  store?: Pick<TypedStorage, 'get' | 'set'>;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const spotsQ = useQuery({ queryKey: ['spots'], queryFn: spots, staleTime: 3600_000 });
  const [picked, setPlace] = useState<string | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const days = dayOptions(now());
  const [dayKey, setDayKey] = useState(days[0]!.key);
  const [time, setTime] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({ pathname: '/chat/[id]', params: { id: chatId } });

  const list = sortSpots(spotsQ.data ?? []);
  // The campus's default spot is picked to start with.
  const place = picked ?? list.find((s) => s.isDefault)?.id ?? null;
  const day = days.find((d) => d.key === dayKey) ?? days[0]!;
  const times = timeOptions(day.date, now());
  const chosenTime = times.find((t) => t.getTime() === time) ?? null;
  const placeReady = place !== null;

  const submit = async () => {
    if (!chosenTime || !placeReady) return;
    if (!store.get('meetup.safetySeen')) {
      setSafetyOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.propose(chatId, chosenTime, { spotId: place! });
      track('meetup_planned', {
        spot_type: spotsQ.data?.find((s) => s.id === place)?.police ? 'police' : 'meetup_spot',
      });
      void qc.invalidateQueries({ queryKey: ['chat-meetup', chatId] });
      close();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="screen-plan-meetup">
      <NavBar leading="close" onLeading={close} title={copy.planTitle} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Two sections: Where, then When (day chips above time chips). */}
        <Text variant="heading" accessibilityRole="header">
          {copy.whereTitle}
        </Text>
        {spotsQ.isPending ? <SkeletonList rows={3} /> : null}
        {list.length > 0 ? <SpotsMap spots={list} selectedId={place} onSelect={setPlace} /> : null}
        {!spotsQ.isPending && list.length === 0 ? (
          <Text variant="body" tone="ink2">
            {copy.noSpots}
          </Text>
        ) : null}
        {list.map((s) => (
          <View key={s.id} style={styles.spot}>
            <View style={styles.flex}>
              <OptionRow
                label={s.name}
                description={s.description ?? s.hours ?? undefined}
                selected={place === s.id}
                onPress={() => setPlace(s.id)}
                kind="radio"
              />
              {s.police ? (
                <View style={styles.tag}>
                  <Tag label={copy.police} tone="green" />
                </View>
              ) : null}
            </View>
            <IconButton
              icon="pin"
              accessibilityLabel={fill(copy.directions, { name: s.name })}
              onPress={() => void openUrl(directionsUrl(s, Platform.OS))}
            />
          </View>
        ))}
        {list.length > 0 ? (
          <Text variant="meta" tone="ink2" testID="meetup-spots-only">
            {copy.spotsOnlyNote}
          </Text>
        ) : null}

        <Text variant="heading" accessibilityRole="header" style={styles.section}>
          {copy.dayTitle}
        </Text>
        <View style={styles.chips}>
          {days.map((d) => (
            <Chip
              key={d.key}
              label={d.label}
              selected={d.key === dayKey}
              onPress={() => {
                setDayKey(d.key);
                setTime(null);
              }}
            />
          ))}
        </View>
        <View style={styles.chips}>
          {times.map((t) => (
            <Chip
              key={t.getTime()}
              label={timeLabel(t)}
              selected={t.getTime() === time}
              onPress={() => setTime(t.getTime())}
            />
          ))}
        </View>
        {error ? <Banner kind="error" message={error} /> : null}
      </ScrollView>
      <View style={styles.dock}>
        <Button
          label={copy.suggest}
          disabled={!chosenTime || !placeReady}
          loading={busy}
          onPress={submit}
          testID="meetup-suggest"
        />
      </View>
      <ConfirmDialog
        visible={safetyOpen}
        title={copy.safetyTitle}
        message={copy.safetyBody}
        confirmLabel={copy.safetyConfirm}
        onConfirm={() => {
          store.set('meetup.safetySeen', true);
          setSafetyOpen(false);
          void submit();
        }}
        onCancel={() => setSafetyOpen(false)}
        testID="meetup-safety"
      />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: { ...readableColumn, padding: theme.space.screen, gap: theme.space.md },
  flex: { flex: 1 },
  spot: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  tag: { flexDirection: 'row', paddingLeft: theme.space['2xl'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  // Between the two sections (2.4: groups are 24 apart).
  section: { marginTop: theme.space.xl - theme.space.md },
  dock: {
    ...readableColumn,
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.md,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.md),
  },
}));
