import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { track } from '@/lib/analytics';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { IconButton } from '@/components/IconButton';
import { Input } from '@/components/Input';
import { NavBar } from '@/components/NavBar';
import { OptionRow } from '@/components/OptionRow';
import { SkeletonList } from '@/components/Skeleton';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { errorText } from '@/lib/errors';
import { fill } from '@/lib/format';
import { meetup as copy } from '@/strings';

import { sellApi } from '../sell/api';
import { directionsUrl, sortSpots, type Spot } from '../sell/logic';
import { meetupsApi, type MeetupsApi } from './api';
import { dayOptions, timeLabel, timeOptions } from './logic';
import { SpotsMap } from './SpotsMap';

const CUSTOM = '__custom';

/**
 * E05 Plan the pickup (P8-MEET-02): Meetup spots (police-designated first,
 * with a Directions link), a custom public place, day and time. R11-MAP-01
 * adds a collapsible spots map above the list (synced selection); still no
 * location permission, and the list stays the accessible UI.
 */
export function PlanMeetupScreen({
  chatId,
  api = meetupsApi,
  spots = () => sellApi.spots(),
  openUrl = (url: string) => Linking.openURL(url),
  now = () => new Date(),
}: {
  chatId: string;
  api?: MeetupsApi;
  spots?: () => Promise<Spot[]>;
  openUrl?: (url: string) => Promise<unknown>;
  now?: () => Date;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const spotsQ = useQuery({ queryKey: ['spots'], queryFn: spots, staleTime: 3600_000 });
  const [place, setPlace] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
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
  const day = days.find((d) => d.key === dayKey) ?? days[0]!;
  const times = timeOptions(day.date, now());
  const chosenTime = times.find((t) => t.getTime() === time) ?? null;
  const placeReady = place === CUSTOM ? custom.trim().length > 0 : place !== null;

  const submit = async () => {
    if (!chosenTime || !placeReady) return;
    setBusy(true);
    setError(null);
    try {
      await api.propose(chatId, chosenTime, place === CUSTOM ? { custom } : { spotId: place! });
      track('meetup_planned', {
        spot_type:
          place === CUSTOM
            ? 'custom'
            : spotsQ.data?.find((s) => s.id === place)?.police
              ? 'police'
              : 'meetup_spot',
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
        <Text variant="heading" accessibilityRole="header">
          {copy.spotsTitle}
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
        <OptionRow
          label={copy.somewhereElse}
          selected={place === CUSTOM}
          onPress={() => setPlace(CUSTOM)}
          kind="radio"
        />
        {place === CUSTOM ? (
          <Input
            label={copy.customLabel}
            placeholder={copy.customPlaceholder}
            value={custom}
            onChangeText={setCustom}
            maxLength={60}
            testID="meetup-custom"
          />
        ) : null}

        <Text variant="heading" accessibilityRole="header">
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
        <Text variant="heading" accessibilityRole="header">
          {copy.timeTitle}
        </Text>
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
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: { padding: theme.space.screen, gap: theme.space.md },
  flex: { flex: 1 },
  spot: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  tag: { flexDirection: 'row', paddingLeft: theme.space['2xl'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  dock: {
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.md,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.md),
  },
}));
