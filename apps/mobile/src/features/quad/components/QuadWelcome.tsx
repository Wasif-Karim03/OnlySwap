import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { GlyphTile } from '@/components/EmptyState';
import { Icon, type IconName } from '@/components/icons/Icon';
import { Checkbox } from '@/components/OptionRow';
import { Text } from '@/components/Text';
import { errorText } from '@/lib/errors';
import { quad as copy } from '@/strings';

const RULES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'lock', title: copy.ruleAnonTitle, body: copy.ruleAnonBody },
  { icon: 'users', title: copy.ruleNamesTitle, body: copy.ruleNamesBody },
  { icon: 'ban', title: copy.ruleHarmTitle, body: copy.ruleHarmBody },
  { icon: 'chdn', title: copy.ruleVotesTitle, body: copy.ruleVotesBody },
];

/**
 * Q01 Welcome to the Quad (first visit). The anonymity disclosure is the first
 * rule and first in reading order; nobody can post until they agree.
 */
export function QuadWelcome({ onAccept }: { onAccept: () => Promise<void> }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enter = async () => {
    setBusy(true);
    setError(null);
    try {
      await onAccept();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="quad-welcome">
      <ScrollView contentContainerStyle={styles.body}>
        <GlyphTile icon="quad" tile="accent" />
        <Text variant="title" accessibilityRole="header">
          {copy.welcomeTitle}
        </Text>
        <Text variant="body" tone="ink2">
          {copy.welcomeIntro}
        </Text>
        {RULES.map((r) => (
          <View key={r.title} style={styles.rule} accessible>
            <View style={styles.ruleIcon}>
              <Icon name={r.icon} tone="ink" />
            </View>
            <View style={styles.flex}>
              <Text variant="bodyStrong">{r.title}</Text>
              <Text variant="body" tone="ink2">
                {r.body}
              </Text>
            </View>
          </View>
        ))}
        <Checkbox
          label={copy.agree}
          selected={agreed}
          onPress={() => setAgreed((v) => !v)}
          disabled={busy}
        />
        {error ? <Banner kind="error" message={error} /> : null}
      </ScrollView>
      <View style={styles.dock}>
        <Button
          label={copy.enter}
          disabled={!agreed}
          loading={busy}
          onPress={() => void enter()}
          testID="quad-enter"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: {
    gap: theme.space.lg,
    paddingHorizontal: theme.space.screen,
    paddingTop: rt.insets.top + theme.space.xl,
    paddingBottom: theme.space.xl,
  },
  rule: { flexDirection: 'row', gap: theme.space.md },
  ruleIcon: {
    width: theme.size.hit,
    height: theme.size.hit,
    borderRadius: theme.radius.thumb,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg2,
  },
  flex: { flex: 1, gap: theme.space.xs },
  dock: { paddingHorizontal: theme.space.screen, paddingVertical: theme.space.md },
}));
