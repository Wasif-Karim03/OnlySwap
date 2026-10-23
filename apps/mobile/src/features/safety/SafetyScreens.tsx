import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/icons/Icon';
import { IconButton } from '@/components/IconButton';
import { Input } from '@/components/Input';
import { NavBar } from '@/components/NavBar';
import { SkeletonList } from '@/components/Skeleton';
import { SuccessCheck } from '@/components/SuccessCheck';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { TextArea } from '@/components/TextArea';
import { useTurnstile, type TurnstileSeam } from '@/components/TurnstileField';
import { errorText } from '@/lib/errors';
import { fill } from '@/lib/format';
import { isTurnstileError } from '@/lib/turnstile';
import {
  banner as bannerCopy,
  emailAccess as emailAccessCopy,
  report as reportCopy,
  safety as copy,
  intlLocale,
} from '@/strings';
import { readableColumn } from '@/theme/layout';

import { authApi, type AuthApi } from '../auth/api';
import { SpotsMap } from '../meetups/SpotsMap';
import { sellApi } from '../sell/api';
import { directionsUrl, sortSpots, type Spot } from '../sell/logic';
import { safetyApi, type SafetyApi } from './api';
import { a11yState } from '@/lib/a11y';

/** E21 Report update (P11-SAFE-02): received → reviewed, generic outcome only. */
export function ReportUpdateScreen({ id, api = safetyApi }: { id: string; api?: SafetyApi }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ['report', id], queryFn: () => api.report(id) });
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/notifications'));
  let body;
  if (q.isPending) body = <SkeletonList rows={2} />;
  else if (q.isError) body = <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  else {
    const reviewed = q.data.status === 'reviewed';
    const dayOf = (event: 'received' | 'reviewed') => {
      const at = q.data.timeline.find((t) => t.event === event)?.at;
      return at
        ? new Date(at).toLocaleDateString(intlLocale, { month: 'short', day: 'numeric' })
        : null;
    };
    const currentDay = dayOf(reviewed ? 'reviewed' : 'received');
    // The current status first in plain words, then both steps with the
    // pending one in ink3 so the reporter sees what comes next (3.07).
    body = (
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.status}>
          <Text variant="heading" accessibilityRole="header">
            {reviewed ? copy.reportReviewed : copy.reportReceived}
          </Text>
          {currentDay ? (
            <Text variant="label" tone="ink2" style={styles.regular}>
              {currentDay}
            </Text>
          ) : null}
        </View>
        <Text variant="body" tone="ink2" testID={`report-${q.data.status}`}>
          {reviewed ? copy.reportReviewedBody : copy.reportReceivedBody}
        </Text>
        <View>
          {(['received', 'reviewed'] as const).map((event, i) => {
            const day = dayOf(event);
            const done = event === 'received' || reviewed;
            return (
              <View key={event} style={styles.step(i > 0)} testID={`report-step-${event}`}>
                <Text variant="bodyStrong" tone={done ? 'ink' : 'ink3'} style={styles.flex}>
                  {event === 'reviewed' ? copy.reportReviewed : copy.reportReceived}
                </Text>
                {done && day ? (
                  <Text variant="meta" tone="ink2">
                    {day}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    );
  }
  return (
    <View style={styles.root} testID="screen-report">
      <NavBar title={copy.reportTitle} onLeading={leave} />
      {body}
      {q.data ? (
        <View style={[styles.dock, { paddingBottom: insets.bottom + styles.dockGap.height }]}>
          <Button label={reportCopy.done} onPress={leave} testID="report-done" />
        </View>
      ) : null}
    </View>
  );
}

/**
 * F19 Safety center (P11-SAFE-05): Meetup spots with Directions, tips, 911,
 * banned items. R11-MAP-01: a collapsible spots map above the list; tapping a
 * pin highlights its row. No location permission.
 */
export function SafetyCenterScreen({
  spots = () => sellApi.spots(),
  openUrl = (url: string) => Linking.openURL(url),
}: {
  spots?: () => Promise<Spot[]>;
  openUrl?: (url: string) => Promise<unknown>;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ['spots'], queryFn: spots, staleTime: 3600_000 });
  const [selected, setSelected] = useState<string | null>(null);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/profile'));
  const list = sortSpots(q.data ?? []);
  // Meetup spots first (P5), then tips, then what can't be listed. "Call 911"
  // leaves the tinted card for a docked button in the thumb zone (3.07).
  return (
    <View style={styles.root} testID="screen-safety">
      <NavBar title={copy.centerTitle} onLeading={leave} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="heading" accessibilityRole="header">
          {copy.spotsTitle}
        </Text>
        <Text variant="label" tone="ink2" style={styles.regular}>
          {copy.spotsBody}
        </Text>
        {q.isPending ? <SkeletonList rows={3} /> : null}
        {q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} layout="inline" />
        ) : null}
        {q.isSuccess && list.length === 0 ? (
          <Text variant="body" tone="ink2" testID="safety-spots-empty">
            {copy.spotsEmpty}
          </Text>
        ) : null}
        {list.length > 0 ? (
          <SpotsMap spots={list} selectedId={selected} onSelect={setSelected} />
        ) : null}
        {list.map((s) => (
          <View
            key={s.id}
            style={styles.row(s.id === selected)}
            {...a11yState({ selected: s.id === selected })}
            testID={`safety-spot-${s.id}`}
          >
            <View style={styles.flex}>
              <Text variant="bodyStrong">{s.name}</Text>
              {s.description || s.hours ? (
                <Text variant="meta" tone="ink2">
                  {[s.description, s.hours].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
              {s.police ? (
                <Text variant="meta" tone="ink2" style={styles.police}>
                  {copy.police}
                </Text>
              ) : null}
            </View>
            <IconButton
              icon="pin"
              accessibilityLabel={fill(copy.directions, { name: s.name })}
              onPress={() => void openUrl(directionsUrl(s, Platform.OS))}
            />
          </View>
        ))}

        <Text variant="heading" accessibilityRole="header" style={styles.section}>
          {copy.tipsTitle}
        </Text>
        <View>
          {copy.tipItems.map((t, i) => (
            <View
              key={t.title}
              style={styles.tip(i > 0)}
              accessible
              accessibilityLabel={`${i + 1}. ${t.title}. ${t.body}`}
              testID={`safety-tip-${i}`}
            >
              <Text variant="bodyStrong" tone="ink3" style={styles.num}>
                {String(i + 1)}
              </Text>
              <View style={styles.flex}>
                <Text variant="bodyStrong">{t.title}</Text>
                <Text variant="label" tone="ink2" style={styles.regular}>
                  {t.body}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Text variant="heading" accessibilityRole="header" style={styles.section}>
          {copy.bannedTitle}
        </Text>
        <Text variant="label" tone="ink2" style={styles.regular}>
          {copy.bannedIntro}
        </Text>
        {copy.banned.map((b) => (
          // The label drops the typed bullet so VoiceOver doesn't read "bullet".
          <Text key={b} variant="body" accessibilityLabel={b}>
            {`• ${b}`}
          </Text>
        ))}
      </ScrollView>
      {/* No campus police number is on file, so 911 is the one call button. */}
      <View
        style={[styles.dock, { paddingBottom: insets.bottom + styles.dockGap.height }]}
        testID="safety-emergency"
      >
        <Text variant="label" accessibilityRole="header">
          {copy.emergencyTitle}
        </Text>
        <Text variant="meta" tone="ink2">
          {copy.emergencyBody}
        </Text>
        <Button
          label={copy.emergency}
          variant="destructive"
          onPress={() => void openUrl('tel:911')}
          testID="safety-911"
        />
      </View>
    </View>
  );
}

type Topic = keyof typeof copy.topics;

/** F20 Help (P11-SAFE-05): bundled FAQ and a contact form (support-request). */
export function HelpScreen({
  auth = authApi,
  email: defaultEmail = '',
  turnstileField,
}: {
  auth?: Pick<AuthApi, 'sendSupportRequest'>;
  email?: string;
  /** Test seam for the web bot check (LR-04). */
  turnstileField?: TurnstileSeam;
}) {
  const router = useRouter();
  const bot = useTurnstile(turnstileField);
  const [open, setOpen] = useState<number | null>(null);
  const [topic, setTopic] = useState<Topic>('general');
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.sendSupportRequest({
        email,
        topic,
        body: message,
        ...(bot.token ? { turnstileToken: bot.token } : {}),
      });
      setSent(true);
    } catch (e) {
      setError(isTurnstileError(e) ? bannerCopy.botCheckFailed : errorText(e));
    } finally {
      setBusy(false);
      bot.reset();
    }
  };

  return (
    <View style={styles.root} testID="screen-help">
      <NavBar title={copy.helpTitle} onLeading={leave} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text variant="heading" accessibilityRole="header">
          {copy.faqTitle}
        </Text>
        {copy.faq.map((f, i) => (
          <Tappable
            key={f.q}
            accessibilityRole="button"
            {...a11yState({ expanded: open === i })}
            accessibilityLabel={f.q}
            onPress={() => setOpen(open === i ? null : i)}
          >
            <View style={styles.faq}>
              {/* A trailing chevron that turns down when open (3.07); no animation. */}
              <View style={styles.faqHead}>
                <Text variant="bodyStrong" style={styles.flex}>
                  {f.q}
                </Text>
                <View style={styles.chev(open === i)}>
                  <Icon name="chev" size={16} tone="ink3" />
                </View>
              </View>
              {open === i ? (
                <Text variant="body" tone="ink2">
                  {f.a}
                </Text>
              ) : null}
            </View>
          </Tappable>
        ))}
        {/* F20 lists the lost-access form under Help (DESIGN_SYSTEM.md:285). */}
        <Tappable
          accessibilityRole="link"
          accessibilityLabel={emailAccessCopy.title}
          onPress={() => router.push('/help/email-access')}
          testID="help-email-access"
        >
          <View style={[styles.faq, styles.faqHead]}>
            <Text variant="bodyStrong" style={styles.flex}>
              {emailAccessCopy.title}
            </Text>
            <Icon name="chev" size={16} tone="ink3" />
          </View>
        </Tappable>

        <Text variant="heading" accessibilityRole="header">
          {copy.contactTitle}
        </Text>
        {sent ? (
          <View style={styles.sent} testID="help-sent">
            <SuccessCheck visible accessibilityLabel={copy.contactSent} />
            <Text variant="body">{copy.contactSent}</Text>
          </View>
        ) : (
          <>
            <Text variant="label">{copy.contactTopic}</Text>
            <View style={styles.chips}>
              {(Object.keys(copy.topics) as Topic[]).map((t) => (
                <Chip
                  key={t}
                  label={copy.topics[t]}
                  selected={topic === t}
                  onPress={() => setTopic(t)}
                />
              ))}
            </View>
            <Input
              kind="email"
              label={copy.contactEmail}
              value={email}
              onChangeText={setEmail}
              testID="help-email"
            />
            <TextArea
              label={copy.contactBody}
              value={message}
              onChangeText={setMessage}
              maxLength={2000}
              testID="help-body"
            />
            {bot.element}
            {error ? <Banner kind="error" message={error} /> : null}
            <Button
              label={copy.contactSend}
              disabled={!email.trim() || !message.trim() || (bot.required && !bot.token)}
              loading={busy}
              onPress={send}
              testID="help-send"
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: {
    ...readableColumn,
    padding: theme.space.screen,
    gap: theme.space.md,
    paddingBottom: theme.space['2xl'],
  },
  status: { gap: theme.space.xs },
  step: (divided: boolean) => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.space.rowMin,
    borderTopWidth: divided ? 1 : 0,
    borderTopColor: theme.colors.line,
  }),
  dock: {
    ...readableColumn,
    gap: theme.space.sm,
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
    backgroundColor: theme.colors.bg,
  },
  dockGap: { height: theme.space.md },
  regular: { fontWeight: '400' },
  section: { marginTop: theme.space.md },
  tip: (divided: boolean) => ({
    flexDirection: 'row',
    gap: theme.space.md,
    paddingVertical: theme.space.md,
    borderTopWidth: divided ? 1 : 0,
    borderTopColor: theme.colors.line,
  }),
  num: { minWidth: theme.space.lg },
  police: { fontWeight: '600', marginTop: theme.space.xs },
  row: (selected: boolean) => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.sm,
    marginHorizontal: -theme.space.sm,
    borderRadius: theme.radius.control,
    backgroundColor: selected ? theme.colors.bg2 : 'transparent',
  }),
  tagRow: { flexDirection: 'row', marginTop: theme.space.xs },
  flex: { flex: 1 },
  faq: {
    gap: theme.space.xs,
    paddingVertical: theme.space.md,
    borderBottomWidth: 1,
    borderColor: theme.colors.line,
  },
  faqHead: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  chev: (open: boolean) => ({ transform: [{ rotate: open ? '90deg' : '0deg' }] }),
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  sent: { alignItems: 'center', gap: theme.space.sm, paddingVertical: theme.space.lg },
}));
