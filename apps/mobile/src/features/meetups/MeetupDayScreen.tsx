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
import { IconButton } from '@/components/IconButton';
import { NavBar } from '@/components/NavBar';
import { SkeletonList } from '@/components/Skeleton';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { useToastStore } from '@/components/Toast';
import { getEnv } from '@/lib/env';
import { errorText } from '@/lib/errors';
import { fill } from '@/lib/format';
import { chat as chatCopy, meetup as copy } from '@/strings';
import { readableColumn } from '@/theme/layout';

import { chatApi, type ChatApi } from '../chat/api';
import { chatKey } from '../chat/logic';
import { DealAvatar } from '../offers/DealAvatar';
import { money } from '../offers/logic';
import { directionsUrl, mediaUrl } from '../sell/logic';
import { meetupsApi, type MeetupsApi } from './api';
import {
  countdown,
  LATE_OPTIONS,
  meetupActions,
  meetupOtherName,
  placeOf,
  shareUrl,
  whenLabel,
  whenParts,
  type Meetup,
} from './logic';
import { SpotsMap } from './SpotsMap';

export const meetupKey = (id: string) => ['meetup', id] as const;

/**
 * E06 Meetup day (P8-MEET-03; board E12-E15; DEC 90): the time big, the place
 * and the other person as two plain rows, Running late and Directions, and
 * one big "I'm here" (only near the time) with 911 one tap away under it.
 * Cancel, reschedule, share with a friend and no-show keep their rules.
 *
 * The other person's name and the item come from the meetup's chat
 * (get_chat), so the screen is complete when opened from a notification,
 * which passes only the meetup id. `otherName` (the `?name=` route param) is
 * only a first paint while the chat loads.
 */
export function MeetupDayScreen({
  id,
  otherName = '',
  api = meetupsApi,
  chats = chatApi,
  site = () => getEnv().EXPO_PUBLIC_SITE_URL,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  share = (c) => Share.share(c),
  openUrl = (url: string) => Linking.openURL(url),
  now = () => new Date(),
  tickMs = 30_000,
}: {
  id: string;
  otherName?: string;
  api?: MeetupsApi;
  chats?: Pick<ChatApi, 'chat'>;
  site?: () => string;
  mediaBase?: () => string;
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
  const chatId = query.data?.chat_id ?? null;
  const chat = useQuery({
    queryKey: chatKey(chatId ?? ''),
    queryFn: () => chats.chat(chatId!),
    enabled: chatId !== null,
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
  const c = chat.data ?? null;
  const name = meetupOtherName(c, otherName, chatCopy.deletedUser);
  const avatar = c?.other?.avatar_path ? mediaUrl(mediaBase(), c.other.avatar_path) : null;
  const parts = whenParts(m.starts_at, clock);
  const confirmed = m.status === 'confirmed';
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

  const spotMeta = [m.spot?.police ? copy.police : m.spot ? copy.spotMeta : null, m.spot?.hours]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.root} testID={`screen-meetup-${m.status}`}>
      <NavBar
        onLeading={leave}
        title={copy.dayScreenTitle}
        trailing={
          can.share ? (
            <IconButton
              icon="share"
              accessibilityLabel={copy.share}
              onPress={onShare}
              testID="meetup-share"
            />
          ) : null
        }
      />
      <ScrollView contentContainerStyle={styles.body}>
        <View
          accessible
          accessibilityRole="header"
          accessibilityLabel={whenLabel(m.starts_at, clock)}
        >
          <Text variant="label" tone="ink3">
            {parts.dayTitle}
          </Text>
          <Text style={styles.time}>{parts.time}</Text>
        </View>
        {confirmed ? (
          <Text variant="body" tone="ink2" testID="meetup-countdown">
            {countdown(m.starts_at, clock)}
          </Text>
        ) : null}
        {m.previous_starts_at ? (
          <Text variant="meta" tone="ink2">
            {fill(copy.rescheduledFrom, { when: whenLabel(m.previous_starts_at, clock) })}
          </Text>
        ) : null}
        {m.status === 'cancelled' ? <Banner kind="info" message={copy.cancelled} /> : null}

        {m.spot ? <SpotsMap spots={[m.spot]} selectedId={m.spot.id} testID="meetup-map" /> : null}

        <View style={styles.list}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text variant="bodyStrong">{placeOf(m)}</Text>
              {spotMeta ? (
                <Text variant="meta" tone={m.spot?.police ? 'green' : 'ink3'}>
                  {spotMeta}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={[styles.row, styles.rowLine]} testID="meetup-person">
            <DealAvatar name={name || chatCopy.deletedUser} uri={avatar} />
            <View style={styles.flex}>
              <Text variant="bodyStrong" numberOfLines={1} testID="meetup-other-name">
                {name}
              </Text>
              {c ? (
                <Text variant="meta" tone="ink3" numberOfLines={2}>
                  {`${c.listing_title} · ${fill(chatCopy.inPerson, { amount: money(c.agreed_cents) })}`}
                </Text>
              ) : null}
            </View>
            {confirmed ? (
              <Text
                variant="label"
                tone={m.other_here_at ? 'green' : 'ink3'}
                accessibilityLabel={
                  m.other_here_at
                    ? fill(copy.theyreHere, { name })
                    : fill(copy.notHereYet, { name })
                }
                testID="meetup-other-status"
              >
                {m.other_here_at ? copy.hereShort : copy.notHereShort}
              </Text>
            ) : null}
          </View>
        </View>

        {confirmed && m.my_here_at ? (
          <Text variant="label" tone="green" testID="meetup-you-here">
            {copy.youreHere}
          </Text>
        ) : null}
        {confirmed && m.late_minutes ? (
          <Text variant="meta" tone="amber">
            {m.late_is_me
              ? fill(copy.youAreLate, { n: m.late_minutes })
              : fill(copy.theyAreLate, { name, n: m.late_minutes })}
          </Text>
        ) : null}
        {error ? <Banner kind="error" message={error} /> : null}

        {can.late || m.spot ? (
          <View style={styles.pair}>
            {can.late ? (
              <View style={styles.flex}>
                <Button
                  label={copy.runningLateShort}
                  variant="secondary"
                  size="M"
                  accessibilityHint={copy.runningLate}
                  onPress={() => setLateOpen((v) => !v)}
                  testID="meetup-late"
                />
              </View>
            ) : null}
            {m.spot ? (
              <View style={styles.flex}>
                <Button
                  label={copy.directionsShort}
                  variant="secondary"
                  size="M"
                  onPress={() => void openUrl(directionsUrl(m.spot!, Platform.OS))}
                  testID="meetup-directions"
                />
              </View>
            ) : null}
          </View>
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

        <View style={styles.more}>
          {can.reschedule ? (
            <Button
              label={copy.reschedule}
              variant="text"
              size="M"
              fullWidth={false}
              onPress={() =>
                router.push({ pathname: '/chat/[id]/meetup', params: { id: m.chat_id } })
              }
              testID="meetup-reschedule"
            />
          ) : null}
          {can.noShow ? (
            <Button
              label={copy.noShow}
              variant="text"
              size="M"
              fullWidth={false}
              onPress={() => setNoShowOpen(true)}
              testID="meetup-noshow"
            />
          ) : null}
          {can.cancel ? (
            <Button
              label={copy.cancel}
              variant="text"
              size="M"
              fullWidth={false}
              onPress={() => setCancelOpen(true)}
              testID="meetup-cancel"
            />
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.dock}>
        {can.checkIn ? (
          <Button
            label={copy.imHere}
            onPress={() => run(() => api.checkIn(m.id))}
            testID="meetup-here"
          />
        ) : null}
        {/* 911 stays one tap away on every state (SECURITY; DEC 90 red text link). */}
        <Tappable
          accessibilityRole="button"
          accessibilityLabel={copy.emergency}
          accessibilityHint={copy.emergencyHint}
          onPress={() => void openUrl('tel:911')}
          style={styles.safetyHit}
          testID="meetup-911"
        >
          <View style={styles.safety}>
            <Text variant="label" tone="red">
              {copy.emergency}
            </Text>
          </View>
        </Tappable>
      </View>

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

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: { ...readableColumn, padding: theme.space.screen, gap: theme.space.md },
  flex: { flex: 1 },
  // The meetup time: the display style a little larger (DEC 90).
  time: {
    fontSize: theme.type.display.fontSize * 1.2,
    lineHeight: theme.type.display.fontSize * 1.35,
    fontWeight: theme.type.display.fontWeight,
    letterSpacing: theme.type.display.letterSpacing * 1.2,
    color: theme.colors.ink,
  },
  // A plain grouped list (DEC 90): hairline border, rows inside.
  list: {
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.card,
  },
  row: {
    minHeight: theme.space.rowMin + theme.space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.sm,
  },
  rowLine: { borderTopWidth: 1, borderTopColor: theme.colors.line },
  pair: { flexDirection: 'row', gap: theme.space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  more: { alignItems: 'flex-start' },
  dock: {
    ...readableColumn,
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.md,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.md),
    gap: theme.space.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
    backgroundColor: theme.colors.bg,
  },
  safetyHit: { alignSelf: 'center' },
  safety: {
    minHeight: theme.size.hit,
    paddingHorizontal: theme.space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
