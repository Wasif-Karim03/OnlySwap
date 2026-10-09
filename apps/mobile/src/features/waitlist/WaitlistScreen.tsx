import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { ErrorState } from '@/components/ErrorState';
import { clampProgress } from '@/components/Progress';
import { SkeletonList } from '@/components/Skeleton';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { useToastStore } from '@/components/Toast';
import { getEnv } from '@/lib/env';
import { fill } from '@/lib/format';
import { registerForPush } from '@/lib/push';
import { getStorage } from '@/lib/storage';
import { waitlist as copy } from '@/strings';
import { readableColumn } from '@/theme/layout';
import { liftShadow } from '@/theme/shadow';

import { authApi, type AuthApi } from '../auth/api';
import { useGateHandoff } from '../auth/useAppGate';
import { waitlistApi, waitlistKey, type WaitlistApi } from './api';
import {
  invitedText,
  inviteLink,
  peopleLeft,
  progressOf,
  shareMessage,
  waitlistNext,
} from './logic';

/** The count refreshes on focus and every minute while the screen is open. */
export const WAITLIST_REFRESH_MS = 60_000;

type Deps = {
  api?: WaitlistApi;
  auth?: Pick<AuthApi, 'signOut'>;
  share?: (content: { message: string; url?: string }) => Promise<unknown>;
  copyText?: (text: string) => Promise<unknown>;
  site?: () => string;
  notificationsAsked?: () => boolean;
  registerPush?: () => Promise<unknown>;
};

/**
 * A09 Campus waitlist (P4-AUTH-12; board A13, DEC 90 mock screen 3): the gate
 * when your campus isn't open yet. Grey page, the campus small over a large
 * title, a ring with how many are left and your place, your invite link
 * (copy and share) with how many joined with it, and one line about the
 * opening notification. Switches to A10 by itself when the campus opens.
 */
export function WaitlistScreen({
  api = waitlistApi,
  auth = authApi,
  share = (content) => Share.share(content),
  copyText = (text) => Clipboard.setStringAsync(text),
  site = () => getEnv().EXPO_PUBLIC_SITE_URL,
  notificationsAsked = () => getStorage().get('onboarding.notificationsAsked') === true,
  registerPush = registerForPush,
}: Deps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const handoff = useGateHandoff();
  const q = useQuery({
    queryKey: waitlistKey,
    queryFn: api.position,
    refetchInterval: WAITLIST_REFRESH_MS,
  });
  const routed = useRef(false);

  useFocusEffect(
    useCallback(() => {
      void qc.invalidateQueries({ queryKey: waitlistKey });
    }, [qc]),
  );

  // Waitlisted people never reach the tabs, where the push token is normally
  // registered; do it here so the "campus open" push can reach them.
  useEffect(() => {
    void Promise.resolve()
      .then(() => registerPush())
      .catch(() => {});
  }, [registerPush]);

  const next = q.data ? waitlistNext(q.data) : 'wait';
  useEffect(() => {
    if (routed.current || next === 'wait') return;
    routed.current = true;
    if (next === 'unlocked') router.replace('/unlocked');
    else handoff();
  }, [next, router, handoff]);

  const toast = useToastStore.getState();

  let body;
  if (q.isPending) {
    body = (
      <View accessibilityLabel={copy.loading} style={styles.pad}>
        <SkeletonList rows={4} testID="waitlist-loading" />
      </View>
    );
  } else if (q.isError && !q.data) {
    body = <ErrorState error={q.error} onRetry={() => q.refetch()} testID="waitlist-error" />;
  } else {
    const info = q.data;
    const link = info.invite_code ? inviteLink(site(), info.invite_code) : null;
    const campusName = info.campus?.name ?? null;
    const values = { members: info.members, threshold: info.threshold };
    const left = peopleLeft(info);
    body = (
      <ScrollView contentContainerStyle={styles.body}>
        <View>
          {campusName ? (
            <Text variant="label" tone="ink3" testID="waitlist-campus">
              {campusName}
            </Text>
          ) : null}
          <Text variant="display" accessibilityRole="header" style={styles.title}>
            {copy.listTitle}
          </Text>
          <Text variant="body" tone="ink2" style={styles.lead}>
            {fill(copy.listBody, { threshold: info.threshold })}
          </Text>
        </View>

        <View style={[styles.card, styles.ringCard]}>
          <ProgressRing
            value={progressOf(info)}
            label={fill(copy.progressLabel, values)}
            center={String(info.members)}
            under={fill(copy.ringOf, { threshold: info.threshold })}
            testID="waitlist-progress"
          />
          <View style={styles.flex}>
            <Text variant="heading" testID="waitlist-count">
              {left > 0 ? fill(copy.moreToGo, { left }) : copy.almost}
            </Text>
            {info.position !== null && left > 0 ? (
              <Text variant="label" tone="ink2" style={styles.regular} testID="waitlist-position">
                {fill(copy.positionShort, { position: info.position })}
              </Text>
            ) : null}
            <Text variant="label" tone="ink2" style={styles.regular}>
              {copy.countsToward}
            </Text>
          </View>
        </View>

        {link ? (
          <View style={styles.card} testID="waitlist-invite">
            <Text variant="heading" accessibilityRole="header">
              {copy.inviteTitle}
            </Text>
            <View style={styles.link}>
              <Text
                variant="label"
                selectable
                numberOfLines={1}
                style={styles.flex}
                testID="waitlist-link"
              >
                {link}
              </Text>
              <Tappable
                accessibilityRole="button"
                accessibilityLabel={copy.copyLabel}
                onPress={async () => {
                  try {
                    await copyText(link);
                    toast.show('success', copy.copied);
                  } catch {
                    toast.show('error', copy.copyFailed);
                  }
                }}
                style={styles.copyHit}
                testID="waitlist-copy"
              >
                <View style={styles.copyPill}>
                  <Text variant="label" tone="onAccent" overlay>
                    {copy.copy}
                  </Text>
                </View>
              </Tappable>
            </View>
            <Button
              label={copy.share}
              variant="dark"
              onPress={() =>
                void share({ message: shareMessage(info, link), url: link }).catch(() => {})
              }
              testID="waitlist-share"
            />
            <Text variant="label" tone="ink3" testID="waitlist-invited">
              {invitedText(info.invited)}
            </Text>
          </View>
        ) : null}

        <Text variant="label" tone="ink2" style={[styles.regular, styles.note]}>
          {copy.notifyLine}
        </Text>

        {notificationsAsked() ? null : (
          <Button
            label={copy.notify}
            variant="secondary"
            onPress={() => router.push('/allow-notifications')}
            testID="waitlist-notify"
          />
        )}
        <Button
          label={copy.signOut}
          variant="text"
          onPress={async () => {
            await auth.signOut('local').catch(() => {});
            router.replace('/welcome');
          }}
          testID="waitlist-sign-out"
        />
      </ScrollView>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="screen-waitlist">
      {body}
    </View>
  );
}

/**
 * Waitlist progress as a ring (DEC 90, mock screen 3): members in the middle,
 * "of 500" under it. Static: nothing moves, so Reduce Motion has nothing to
 * stop. Read as one progress bar.
 */
function ProgressRing({
  value,
  label,
  center,
  under,
  testID,
}: {
  value: number;
  label: string;
  center: string;
  under: string;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const side = theme.size.glyphTile + theme.space.lg;
  const stroke = theme.space.md;
  const r = (side - stroke) / 2;
  const length = 2 * Math.PI * r;
  const shown = clampProgress(value);
  return (
    <View
      style={{ width: side, height: side }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(shown * 100) }}
      testID={testID}
    >
      <Svg width={side} height={side}>
        <Circle
          cx={side / 2}
          cy={side / 2}
          r={r}
          stroke={theme.colors.bg3}
          strokeWidth={stroke}
          fill="none"
        />
        {shown > 0 ? (
          <Circle
            cx={side / 2}
            cy={side / 2}
            r={r}
            stroke={theme.colors.accent}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${length} ${length}`}
            strokeDashoffset={length * (1 - shown)}
            fill="none"
            transform={`rotate(-90 ${side / 2} ${side / 2})`}
          />
        ) : null}
      </Svg>
      <View style={styles.ringText} pointerEvents="none">
        <Text variant="heading" overlay>
          {center}
        </Text>
        <Text variant="meta" tone="ink3" overlay>
          {under}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg2 },
  pad: { padding: theme.space.screen },
  body: {
    ...readableColumn,
    gap: theme.space.md,
    padding: theme.space.screen,
    paddingBottom: theme.space['2xl'],
  },
  title: { marginTop: theme.space.xs },
  lead: { marginTop: theme.space.sm, marginBottom: theme.space.sm },
  flex: { flex: 1, gap: theme.space.xs },
  regular: { fontWeight: '400' },
  note: { paddingHorizontal: theme.space.xs },
  card: {
    gap: theme.space.md,
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.card,
  },
  ringCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    padding: theme.space.xl,
    ...liftShadow(),
  },
  ringText: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingLeft: theme.space.md,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.bg2,
  },
  copyHit: { minHeight: theme.size.hit, minWidth: theme.size.hit, justifyContent: 'center' },
  copyPill: {
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xs,
    marginRight: theme.space.sm,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.accent,
  },
}));
