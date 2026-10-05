import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { ErrorState } from '@/components/ErrorState';
import { Icon, type IconName } from '@/components/icons/Icon';
import { NavBar } from '@/components/NavBar';
import { ProgressBar } from '@/components/Progress';
import { SkeletonList } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { useToastStore } from '@/components/Toast';
import { getEnv } from '@/lib/env';
import { fill } from '@/lib/format';
import { registerForPush } from '@/lib/push';
import { getStorage } from '@/lib/storage';
import { waitlist as copy } from '@/strings/en';

import { authApi, type AuthApi } from '../auth/api';
import { useGateHandoff } from '../auth/useAppGate';
import { waitlistApi, waitlistKey, type WaitlistApi } from './api';
import {
  invitedText,
  inviteLink,
  positionText,
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
 * A09 Campus waitlist (P4-AUTH-12; board A13): the gate when your campus
 * isn't open yet. Count toward the threshold, your place, your invite link
 * (copy and share), how many joined with it, what happens next and a short
 * tour. Switches to A10 by itself when the campus opens.
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
    const campusName = info.campus?.short_name ?? null;
    const values = { members: info.members, threshold: info.threshold };
    body = (
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="title" accessibilityRole="header">
          {campusName
            ? fill(copy.heading, { campus: campusName, threshold: info.threshold })
            : fill(copy.headingNoCampus, { threshold: info.threshold })}
        </Text>
        <View style={styles.gap}>
          <Text
            variant="display"
            testID="waitlist-count"
            accessibilityLabel={fill(copy.progressLabel, values)}
          >
            {fill(copy.count, values)}
          </Text>
          <ProgressBar
            value={progressOf(info)}
            label={fill(copy.progressLabel, values)}
            testID="waitlist-progress"
          />
          <Text variant="body" tone="ink2" testID="waitlist-position">
            {positionText(info)}
          </Text>
        </View>

        {link ? (
          <View style={styles.card} testID="waitlist-invite">
            <Text variant="heading" accessibilityRole="header">
              {copy.inviteTitle}
            </Text>
            <Text variant="meta" tone="ink2">
              {copy.inviteBody}
            </Text>
            <View style={styles.link}>
              <Text variant="bodyStrong" selectable style={styles.flex} testID="waitlist-link">
                {link}
              </Text>
            </View>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button
                  label={copy.copyLink}
                  variant="secondary"
                  size="M"
                  accessibilityHint={copy.copyLabel}
                  onPress={async () => {
                    try {
                      await copyText(link);
                      toast.show('success', copy.copied);
                    } catch {
                      toast.show('error', copy.copyFailed);
                    }
                  }}
                  testID="waitlist-copy"
                />
              </View>
              <View style={styles.flex}>
                <Button
                  label={copy.share}
                  size="M"
                  onPress={() =>
                    void share({ message: shareMessage(info, link), url: link }).catch(() => {})
                  }
                  testID="waitlist-share"
                />
              </View>
            </View>
            <Text variant="meta" tone="ink2" testID="waitlist-invited">
              {invitedText(info.invited)}
            </Text>
          </View>
        ) : null}

        <View style={styles.gap}>
          <Text variant="heading" accessibilityRole="header">
            {copy.nextTitle}
          </Text>
          <Step n={1} text={copy.next.count} />
          <Step n={2} text={fill(copy.next.open, { threshold: info.threshold })} />
          <Step n={3} text={copy.next.tell} />
        </View>

        <View style={styles.gap} testID="waitlist-tour">
          <Text variant="heading" accessibilityRole="header">
            {copy.tourTitle}
          </Text>
          <TourRow icon="cards" title={copy.tour.swipeTitle} body={copy.tour.swipeBody} />
          <TourRow icon="tag" title={copy.tour.offerTitle} body={copy.tour.offerBody} />
          <TourRow icon="pin" title={copy.tour.meetTitle} body={copy.tour.meetBody} />
        </View>

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
    <View style={styles.root} testID="screen-waitlist">
      <NavBar variant="large" title={copy.title} />
      {body}
    </View>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.num}>
        <Text variant="label">{n}</Text>
      </View>
      <Text variant="body" style={styles.flex}>
        {text}
      </Text>
    </View>
  );
}

function TourRow({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <View style={styles.step} accessible accessibilityLabel={`${title}. ${body}`}>
      <View style={styles.num}>
        <Icon name={icon} size={18} />
      </View>
      <View style={styles.flex}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="meta" tone="ink2">
          {body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  pad: { padding: theme.space.screen },
  body: { gap: theme.space.xl, padding: theme.space.screen, paddingBottom: theme.space['2xl'] },
  gap: { gap: theme.space.sm },
  flex: { flex: 1, gap: theme.space.xs },
  row: { flexDirection: 'row', gap: theme.space.sm },
  card: {
    gap: theme.space.sm,
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.card,
  },
  link: {
    flexDirection: 'row',
    padding: theme.space.md,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.bg2,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  num: {
    width: theme.size.avatarS,
    height: theme.size.avatarS,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg2,
  },
}));
