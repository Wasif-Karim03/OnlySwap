import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { ErrorState } from '@/components/ErrorState';
import { IconButton } from '@/components/IconButton';
import { Input } from '@/components/Input';
import { NavBar } from '@/components/NavBar';
import { SkeletonList } from '@/components/Skeleton';
import { SuccessCheck } from '@/components/SuccessCheck';
import { Tag } from '@/components/Tag';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { TextArea } from '@/components/TextArea';
import { errorText } from '@/lib/errors';
import { fill } from '@/lib/format';
import { safety as copy, intlLocale } from '@/strings';
import { readableColumn } from '@/theme/layout';

import { authApi, type AuthApi } from '../auth/api';
import { SpotsMap } from '../meetups/SpotsMap';
import { sellApi } from '../sell/api';
import { directionsUrl, sortSpots, type Spot } from '../sell/logic';
import { safetyApi, type SafetyApi } from './api';

/** E21 Report update (P11-SAFE-02): received → reviewed, generic outcome only. */
export function ReportUpdateScreen({ id, api = safetyApi }: { id: string; api?: SafetyApi }) {
  const router = useRouter();
  const q = useQuery({ queryKey: ['report', id], queryFn: () => api.report(id) });
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/notifications'));
  let body;
  if (q.isPending) body = <SkeletonList rows={2} />;
  else if (q.isError) body = <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  else {
    const reviewed = q.data.status === 'reviewed';
    body = (
      <View style={styles.body}>
        {q.data.timeline.map((t) => (
          <View key={t.event} style={styles.step}>
            <Text variant="bodyStrong">
              {t.event === 'reviewed' ? copy.reportReviewed : copy.reportReceived}
            </Text>
            <Text variant="meta" tone="ink2">
              {new Date(t.at).toLocaleDateString(intlLocale, { month: 'short', day: 'numeric' })}
            </Text>
          </View>
        ))}
        <Text variant="body" testID={`report-${q.data.status}`}>
          {reviewed ? copy.reportReviewedBody : copy.reportReceivedBody}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.root} testID="screen-report">
      <NavBar title={copy.reportTitle} onLeading={leave} />
      {body}
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
  const q = useQuery({ queryKey: ['spots'], queryFn: spots, staleTime: 3600_000 });
  const [selected, setSelected] = useState<string | null>(null);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/profile'));
  const list = sortSpots(q.data ?? []);
  return (
    <View style={styles.root} testID="screen-safety">
      <NavBar title={copy.centerTitle} onLeading={leave} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.emergency}>
          <Text variant="bodyStrong">{copy.emergencyBody}</Text>
          <Button
            label={copy.emergency}
            variant="destructive"
            onPress={() => void openUrl('tel:911')}
            testID="safety-911"
          />
        </View>
        <Text variant="heading" accessibilityRole="header">
          {copy.spotsTitle}
        </Text>
        <Text variant="meta" tone="ink2">
          {copy.spotsBody}
        </Text>
        {q.isPending ? <SkeletonList rows={3} /> : null}
        {q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} layout="inline" />
        ) : null}
        {list.length > 0 ? (
          <SpotsMap spots={list} selectedId={selected} onSelect={setSelected} />
        ) : null}
        {list.map((s) => (
          <View
            key={s.id}
            style={styles.row(s.id === selected)}
            accessibilityState={{ selected: s.id === selected }}
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
                <View style={styles.tagRow}>
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
        <Text variant="heading" accessibilityRole="header">
          {copy.tipsTitle}
        </Text>
        {copy.tips.map((t) => (
          <Text key={t} variant="body">
            {`• ${t}`}
          </Text>
        ))}
        <Text variant="heading" accessibilityRole="header">
          {copy.bannedTitle}
        </Text>
        <Text variant="body" tone="ink2">
          {copy.bannedIntro}
        </Text>
        {copy.banned.map((b) => (
          <Text key={b} variant="body">
            {`• ${b}`}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

type Topic = keyof typeof copy.topics;

/** F20 Help (P11-SAFE-05): bundled FAQ and a contact form (support-request). */
export function HelpScreen({
  auth = authApi,
  email: defaultEmail = '',
}: {
  auth?: Pick<AuthApi, 'sendSupportRequest'>;
  email?: string;
}) {
  const router = useRouter();
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
      await auth.sendSupportRequest({ email, topic, body: message });
      setSent(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
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
            accessibilityState={{ expanded: open === i }}
            accessibilityLabel={f.q}
            onPress={() => setOpen(open === i ? null : i)}
          >
            <View style={styles.faq}>
              <Text variant="bodyStrong">{f.q}</Text>
              {open === i ? (
                <Text variant="body" tone="ink2">
                  {f.a}
                </Text>
              ) : null}
            </View>
          </Tappable>
        ))}

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
            {error ? <Banner kind="error" message={error} /> : null}
            <Button
              label={copy.contactSend}
              disabled={!email.trim() || !message.trim()}
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
  step: {
    gap: theme.space.xs,
    paddingVertical: theme.space.sm,
    borderBottomWidth: 1,
    borderColor: theme.colors.line,
  },
  emergency: {
    gap: theme.space.sm,
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.redBg,
  },
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  sent: { alignItems: 'center', gap: theme.space.sm, paddingVertical: theme.space.lg },
}));
