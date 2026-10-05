import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { ErrorState } from '@/components/ErrorState';
import { NavBar } from '@/components/NavBar';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { Toggle } from '@/components/Toggle';
import { useToastStore } from '@/components/Toast';
import { fill } from '@/lib/format';
import { osPermissions, type OsApi } from '@/lib/permissions';
import { notificationsScreen as copy } from '@/strings';
import { readableColumn } from '@/theme/layout';

import { quadApi, type QuadApi } from '../quad/api';
import { useQuadStatus } from '../quad/cache';

import {
  clockLabel,
  notificationsApi,
  QUIET_TIMES,
  type NotificationPrefs,
  type NotificationsApi,
} from './api';

const prefsKey = ['notification-prefs'] as const;

type Switch = Exclude<
  keyof NotificationPrefs,
  'quiet_start' | 'quiet_end' | 'quad_replies' | 'free_food'
>;
const SWITCHES: { key: Switch; label: string; body: string }[] = [
  { key: 'offers', label: copy.offers, body: copy.offersBody },
  { key: 'messages', label: copy.messages, body: copy.messagesBody },
  { key: 'meetups', label: copy.meetups, body: copy.meetupsBody },
  { key: 'saved_search', label: copy.savedSearch, body: copy.savedSearchBody },
  { key: 'price_drop', label: copy.priceDrop, body: copy.priceDropBody },
  { key: 'tips', label: copy.tips, body: copy.tipsBody },
  { key: 'message_previews', label: copy.previews, body: copy.previewsBody },
];

/** F11 Notification settings (P9-NOTIF-02): per type, tips opt-in, previews, quiet hours, OS-off banner. */
export function NotificationSettingsScreen({
  api = notificationsApi,
  os = osPermissions.notifications,
  openSettings = () => Linking.openSettings(),
  quad = quadApi,
}: {
  api?: NotificationsApi;
  os?: OsApi;
  openSettings?: () => Promise<unknown>;
  quad?: Pick<QuadApi, 'status'>;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: prefsKey, queryFn: () => api.prefs() });
  const quadOn = useQuadStatus(quad).data?.enabled === true;
  const [osOff, setOsOff] = useState(false);
  const [editing, setEditing] = useState<'quiet_start' | 'quiet_end' | null>(null);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  useEffect(() => {
    let alive = true;
    os.get()
      .then((p) => alive && setOsOff(p.status !== 'granted'))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [os]);

  const save = async (patch: Partial<NotificationPrefs>) => {
    const before = qc.getQueryData<NotificationPrefs>(prefsKey);
    qc.setQueryData<NotificationPrefs>(prefsKey, (old) => (old ? { ...old, ...patch } : old));
    try {
      qc.setQueryData(prefsKey, await api.updatePrefs(patch));
    } catch {
      qc.setQueryData(prefsKey, before);
      useToastStore.getState().show('error', copy.saveFailed);
    }
  };

  let body;
  if (q.isPending) body = <SkeletonList rows={6} />;
  else if (q.isError) body = <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  else {
    const p = q.data;
    body = (
      <ScrollView contentContainerStyle={styles.body}>
        {osOff ? (
          <View style={styles.gap} testID="notifications-os-off">
            <Banner kind="warning" message={copy.osOff} />
            <Button
              label={copy.openSettings}
              variant="secondary"
              size="M"
              onPress={() => void openSettings()}
            />
          </View>
        ) : null}
        {SWITCHES.map((s) => (
          <Toggle
            key={s.key}
            label={s.label}
            description={s.body}
            value={p[s.key]}
            onChange={(v) => void save({ [s.key]: v })}
          />
        ))}
        {typeof p.free_food === 'boolean' ? (
          <Toggle
            label={copy.freeFood}
            description={copy.freeFoodBody}
            value={p.free_food}
            onChange={(v) => void save({ free_food: v })}
          />
        ) : null}
        {quadOn && typeof p.quad_replies === 'boolean' ? (
          <Toggle
            label={copy.quadReplies}
            description={copy.quadRepliesBody}
            value={p.quad_replies}
            onChange={(v) => void save({ quad_replies: v })}
          />
        ) : null}
        <View style={styles.gap}>
          <Text variant="heading" accessibilityRole="header">
            {copy.quiet}
          </Text>
          <Text variant="meta" tone="ink2">
            {fill(copy.quietBody, {
              start: clockLabel(p.quiet_start),
              end: clockLabel(p.quiet_end),
            })}
          </Text>
          <View style={styles.row}>
            <Button
              label={`${copy.quietStart}: ${clockLabel(p.quiet_start)}`}
              variant={editing === 'quiet_start' ? 'dark' : 'secondary'}
              size="S"
              onPress={() => setEditing(editing === 'quiet_start' ? null : 'quiet_start')}
              testID="quiet-start"
            />
            <Button
              label={`${copy.quietEnd}: ${clockLabel(p.quiet_end)}`}
              variant={editing === 'quiet_end' ? 'dark' : 'secondary'}
              size="S"
              onPress={() => setEditing(editing === 'quiet_end' ? null : 'quiet_end')}
              testID="quiet-end"
            />
          </View>
          {editing ? (
            <View style={styles.chips}>
              {QUIET_TIMES.map((t) => (
                <Chip
                  key={t}
                  label={clockLabel(t)}
                  selected={p[editing] === t}
                  onPress={() => {
                    void save({ [editing]: t });
                    setEditing(null);
                  }}
                />
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.root} testID="screen-notification-settings">
      <NavBar title={copy.settingsTitle} onLeading={leave} />
      {body}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: { ...readableColumn, padding: theme.space.screen, gap: theme.space.lg },
  gap: { gap: theme.space.sm },
  row: { flexDirection: 'row', gap: theme.space.sm, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
}));
