import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, View, useWindowDimensions } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/icons/Icon';
import { GroupedList } from '@/components/ListRow';
import { NavBar } from '@/components/NavBar';
import { Sheet } from '@/components/Sheet';
import { SkeletonList } from '@/components/Skeleton';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { Toggle } from '@/components/Toggle';
import { useToastStore } from '@/components/Toast';
import { fill } from '@/lib/format';
import { osPermissions, type OsApi } from '@/lib/permissions';
import { supportsFeature } from '@/lib/platform';
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
  'quiet_start' | 'quiet_end' | 'quad_replies' | 'free_food' | 'comments'
>;
/** Self-evident rows show the label only; the rest keep one line (DESIGN_REVIEW 3.06). */
const SWITCHES: { key: Switch; label: string; body?: string }[] = [
  { key: 'offers', label: copy.offers },
  { key: 'messages', label: copy.messages },
  { key: 'meetups', label: copy.meetups },
  { key: 'saved_search', label: copy.savedSearch },
  { key: 'price_drop', label: copy.priceDrop },
  { key: 'tips', label: copy.tips, body: copy.tipsBody },
  { key: 'message_previews', label: copy.previews, body: copy.previewsBody },
];

/** The time list in the quiet-hours sheet scrolls past this share of the window. */
const QUIET_SHEET_MAX = 0.5;

/** A quiet-hours row: label, current time, chevron; opens the time sheet. */
function QuietRow({
  label,
  value,
  onPress,
  testID,
}: {
  label: string;
  value: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      onPress={onPress}
      testID={testID}
    >
      <View style={styles.quietRow}>
        <Text variant="body" style={styles.flex}>
          {label}
        </Text>
        <Text variant="body" tone="ink2">
          {value}
        </Text>
        <Icon name="chev" size={18} tone="ink3" />
      </View>
    </Tappable>
  );
}

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
  const { height: windowHeight } = useWindowDimensions();

  useEffect(() => {
    // Web app: the switches still apply to the account's phones, but the browser
    // never gets pushes, so there is no OS setting to warn about (P13-WEB-07).
    if (!supportsFeature('push')) return undefined;
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
        <GroupedList>
          {SWITCHES.map((s) => (
            <View key={s.key} style={styles.toggleRow}>
              <Toggle
                label={s.label}
                description={s.body}
                value={p[s.key]}
                onChange={(v) => void save({ [s.key]: v })}
              />
            </View>
          ))}
          {typeof p.comments === 'boolean' ? (
            <View style={styles.toggleRow}>
              <Toggle
                label={copy.comments}
                description={copy.commentsBody}
                value={p.comments}
                onChange={(v) => void save({ comments: v })}
              />
            </View>
          ) : null}
          {typeof p.free_food === 'boolean' ? (
            <View style={styles.toggleRow}>
              <Toggle
                label={copy.freeFood}
                description={copy.freeFoodBody}
                value={p.free_food}
                onChange={(v) => void save({ free_food: v })}
              />
            </View>
          ) : null}
          {quadOn && typeof p.quad_replies === 'boolean' ? (
            <View style={styles.toggleRow}>
              <Toggle
                label={copy.quadReplies}
                description={copy.quadRepliesBody}
                value={p.quad_replies}
                onChange={(v) => void save({ quad_replies: v })}
              />
            </View>
          ) : null}
        </GroupedList>
        <GroupedList
          header={copy.quiet}
          footer={fill(copy.quietBody, {
            start: clockLabel(p.quiet_start),
            end: clockLabel(p.quiet_end),
          })}
        >
          <QuietRow
            label={copy.quietStart}
            value={clockLabel(p.quiet_start)}
            onPress={() => setEditing('quiet_start')}
            testID="quiet-start"
          />
          <QuietRow
            label={copy.quietEnd}
            value={clockLabel(p.quiet_end)}
            onPress={() => setEditing('quiet_end')}
            testID="quiet-end"
          />
        </GroupedList>
      </ScrollView>
    );
  }

  return (
    <View style={styles.root} testID="screen-notification-settings">
      <NavBar title={copy.settingsTitle} onLeading={leave} />
      {body}
      <Sheet
        visible={editing !== null && q.isSuccess}
        onClose={() => setEditing(null)}
        title={editing === 'quiet_end' ? copy.quietEnd : copy.quietStart}
        testID="quiet-sheet"
      >
        <ScrollView style={styles.sheetList(windowHeight)}>
          <View style={styles.chips}>
            {editing && q.data
              ? QUIET_TIMES.map((t) => (
                  <Chip
                    key={t}
                    label={clockLabel(t)}
                    selected={q.data[editing] === t}
                    onPress={() => {
                      void save({ [editing]: t });
                      setEditing(null);
                    }}
                  />
                ))
              : null}
          </View>
        </ScrollView>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: { ...readableColumn, padding: theme.space.screen, gap: theme.space.lg },
  gap: { gap: theme.space.sm },
  flex: { flex: 1 },
  sheetList: (windowHeight: number) => ({ maxHeight: windowHeight * QUIET_SHEET_MAX }),
  toggleRow: { paddingHorizontal: theme.space.lg },
  quietRow: {
    minHeight: theme.space.rowMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
}));
