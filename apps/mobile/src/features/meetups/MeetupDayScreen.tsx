import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, Share, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { track } from '@/lib/analytics';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/ErrorState';
import { NavBar } from '@/components/NavBar';
import { SkeletonList } from '@/components/Skeleton';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { useToastStore } from '@/components/Toast';
import { getEnv } from '@/lib/env';
import { errorText } from '@/lib/errors';
import { fill } from '@/lib/format';
import { meetup as copy } from '@/strings/en';

import { directionsUrl } from '../sell/logic';
import { meetupsApi, type MeetupsApi } from './api';
import {
  countdown,
  LATE_OPTIONS,
  meetupActions,
  placeOf,
  shareUrl,
  whenLabel,
  type Meetup,
} from './logic';

export const meetupKey = (id: string) => ['meetup', id] as const;

/**
 * E06 Meetup day (P8-MEET-03; board E12-E15): countdown, I'm here, running
 * late, cancel, reschedule, share with a friend, no-show, 911.
 */
export function MeetupDayScreen({
  id,
  otherName = '',
  api = meetupsApi,
  site = () => getEnv().EXPO_PUBLIC_SITE_URL,
  share = (c) => Share.share(c),
  openUrl = (url: string) => Linking.openURL(url),
  now = () => new Date(),
  tickMs = 30_000,
}: {
  id: string;
  otherName?: string;
  api?: MeetupsApi;
  site?: () => string;
  share?: (c: { message: string; url?: string }) => Promise<unknown>;
  openUrl?: (url: string) => Promise<unknown>;
  now?: () => Date;
  tickMs?: number;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: meetupKey(id),
    queryFn: () => api.get(id),
    refetchInterval: 60_000,
  });
  const [clock, setClock] = useState(() => now());
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [noShowOpen, setNoShowOpen] = useState(false);
  const [lateOpen, setLateOpen] = useState(false);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/inbox'));

  useEffect(() => {
    const t = setInterval(() => setClock(now()), tickMs);
    return () => clearInterval(t);
  }, [now, tickMs]);

  if (query.isPending) {
    return (
      <View style={styles.root}>
        <NavBar onLeading={leave} title={copy.dayScreenTitle} />
        <SkeletonList rows={4} />
      </View>
    );
  }
  if (query.isError || !query.data) {
    return (
      <View style={styles.root}>
        <NavBar onLeading={leave} title={copy.dayScreenTitle} />
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </View>
    );
  }
  const m: Meetup = query.data;
  const can = meetupActions(m, clock);
  const name = otherName || '';
  const refresh = () => qc.invalidateQueries({ queryKey: meetupKey(id) });
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await refresh();
      void qc.invalidateQueries({ queryKey: ['chat-meetup', m.chat_id] });
    } catch (e) {
      setError(errorText(e));
    }
  };

  const onShare = async () => {
    await run(async () => {
      const { token } = await api.share(m.id);
      const url = shareUrl(site(), token);
      const message = fill(copy.shareMessage, { url });
      track('share_tapped', { surface: 'meetup' });
      await share(Platform.OS === 'ios' ? { message, url } : { message });
    });
  };

  return (
    <View style={styles.root} testID={`screen-meetup-${m.status}`}>
      <NavBar onLeading={leave} title={copy.dayScreenTitle} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="title" accessibilityRole="header">
          {whenLabel(m.starts_at, clock)}
        </Text>
        {m.status === 'confirmed' ? (
          <Text variant="bodyStrong" testID="meetup-countdown">
            {countdown(m.starts_at, clock)}
          </Text>
        ) : null}
        {m.previous_starts_at ? (
          <Text variant="meta" tone="ink2">
            {fill(copy.rescheduledFrom, { when: whenLabel(m.previous_starts_at, clock) })}
          </Text>
        ) : null}
        <View style={styles.row}>
          <Text variant="body" style={styles.flex}>
            {placeOf(m)}
          </Text>
          {m.spot?.police ? <Tag label={copy.police} tone="green" /> : null}
        </View>
        {m.spot ? (
          <Button
            label={copy.directionsShort}
            variant="secondary"
            size="M"
            onPress={() => void openUrl(directionsUrl(m.spot!, Platform.OS))}
          />
        ) : null}

        {m.status === 'cancelled' ? <Banner kind="info" message={copy.cancelled} /> : null}
        {m.status === 'confirmed' ? (
          <View style={styles.status}>
            <Text variant="label">{m.my_here_at ? copy.youreHere : ''}</Text>
            <Text variant="label" testID="meetup-other-status">
              {m.other_here_at ? fill(copy.theyreHere, { name }) : fill(copy.notHereYet, { name })}
            </Text>
            {m.late_minutes ? (
              <Text variant="meta" tone="amber">
                {m.late_is_me
                  ? fill(copy.youAreLate, { n: m.late_minutes })
                  : fill(copy.theyAreLate, { name, n: m.late_minutes })}
              </Text>
            ) : null}
          </View>
        ) : null}
        {error ? <Banner kind="error" message={error} /> : null}

        <View style={styles.actions}>
          {can.checkIn ? (
            <Button
              label={copy.imHere}
              onPress={() => run(() => api.checkIn(m.id))}
              testID="meetup-here"
            />
          ) : null}
          {can.late ? (
            <Button
              label={copy.runningLate}
              variant="secondary"
              onPress={() => setLateOpen((v) => !v)}
              testID="meetup-late"
            />
          ) : null}
          {lateOpen ? (
            <View style={styles.chips}>
              {LATE_OPTIONS.map((n) => (
                <Chip
                  key={n}
                  label={fill(copy.lateBy, { n })}
                  onPress={async () => {
                    setLateOpen(false);
                    await run(() => api.late(m.id, n));
                  }}
                />
              ))}
            </View>
          ) : null}
          {can.share ? (
            <Button
              label={copy.share}
              variant="secondary"
              onPress={onShare}
              testID="meetup-share"
            />
          ) : null}
          {can.reschedule ? (
            <Button
              label={copy.reschedule}
              variant="secondary"
              onPress={() =>
                router.push({ pathname: '/chat/[id]/meetup', params: { id: m.chat_id } })
              }
            />
          ) : null}
          {can.noShow ? (
            <Button
              label={copy.noShow}
              variant="secondary"
              onPress={() => setNoShowOpen(true)}
              testID="meetup-noshow"
            />
          ) : null}
          {can.cancel ? (
            <Button
              label={copy.cancel}
              variant="text"
              onPress={() => setCancelOpen(true)}
              testID="meetup-cancel"
            />
          ) : null}
        </View>

        <View style={styles.safety}>
          <Text variant="meta" tone="ink2">
            {copy.emergencyHint}
          </Text>
          <Button
            label={copy.emergency}
            variant="destructive"
            size="M"
            onPress={() => void openUrl('tel:911')}
          />
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={cancelOpen}
        title={copy.cancelTitle}
        message={fill(copy.cancelBody, { name })}
        confirmLabel={copy.cancelConfirm}
        cancelLabel={copy.keep}
        destructive
        onConfirm={async () => {
          await api.cancel(m.id);
          setCancelOpen(false);
          await refresh();
        }}
        onCancel={() => setCancelOpen(false)}
      />
      <ConfirmDialog
        visible={noShowOpen}
        title={copy.noShowTitle}
        message={copy.noShowBody}
        confirmLabel={copy.noShowConfirm}
        destructive
        onConfirm={async () => {
          await api.noShow(m.id);
          setNoShowOpen(false);
          useToastStore.getState().show('info', copy.noShowSent);
          await refresh();
        }}
        onCancel={() => setNoShowOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: { padding: theme.space.screen, gap: theme.space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  flex: { flex: 1 },
  status: {
    gap: theme.space.xs,
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.bg2,
  },
  actions: { gap: theme.space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  safety: { gap: theme.space.sm, marginTop: theme.space.xl },
}));
