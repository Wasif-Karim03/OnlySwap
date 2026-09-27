import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/icons/Icon';
import type { IconName } from '@/components/icons/Icon';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { getEnv } from '@/lib/env';
import { errorCopy, toAppError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { rules as copy, states } from '@/strings/en';

import { authApi, type AuthApi } from './api';
import { AuthStep } from './AuthStep';
import { useGateHandoff } from './useAppGate';

const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

type LegalPage = 'rules' | 'terms' | 'privacy';

function defaultOpenLegal(page: LegalPage): void {
  void Linking.openURL(`${getEnv().EXPO_PUBLIC_SITE_URL.replace(/\/+$/, '')}/${page}`);
}

/**
 * A07 Community rules (P4-AUTH-09, board A11) and the D10 Updated rules
 * variant (P4-AUTH-17, PM-04) at `/rules?updated=1`. Agreeing records the
 * version from get_app_config; the box also confirms the person is 18+.
 */
export function RulesScreen({
  api = authApi,
  openLegal = defaultOpenLegal,
}: {
  api?: AuthApi;
  openLegal?: (page: LegalPage) => void;
}) {
  const { theme } = useUnistyles();
  const handoff = useGateHandoff();
  const { updated } = useLocalSearchParams<{ updated?: string }>();
  const isUpdate = updated === '1';
  const config = useQuery({ queryKey: ['app_config'], queryFn: () => api.getAppConfig() });
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agree = async () => {
    if (!config.data || !checked) return;
    setSaving(true);
    setError(null);
    try {
      await api.acceptRules(config.data.rulesVersion);
      handoff();
    } catch (e) {
      const err = toAppError(e);
      // An outdated version means the rules changed while this screen was open.
      if (err.code === 'INVALID') void config.refetch();
      setError(errorCopy(err, { campusTimeZone: deviceTz() }));
      setSaving(false);
    }
  };

  if (config.isError && !config.data) {
    return (
      <View style={styles.full} testID="screen-rules-error">
        <ErrorState error={config.error} onRetry={() => config.refetch()} />
      </View>
    );
  }
  if (!config.data) {
    return (
      <View
        style={styles.full}
        testID="screen-rules-loading"
        accessible
        accessibilityLabel={states.loading}
      >
        <ActivityIndicator color={theme.colors.ink2} />
      </View>
    );
  }

  const link = (page: LegalPage, label: string) => (
    <Tappable
      key={page}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={copy.openLink.replace('{page}', label)}
      onPress={() => openLegal(page)}
      style={styles.linkHit}
      testID={`rules-link-${page}`}
    >
      <Text variant="label" style={styles.link}>
        {label}
      </Text>
    </Tappable>
  );

  const changes = config.data.rulesChanges;

  return (
    <AuthStep
      testID={isUpdate ? 'screen-rules-updated' : 'screen-rules'}
      title={isUpdate ? copy.updatedTitle : copy.title}
      body={isUpdate ? copy.updatedBody : copy.body}
      leading="none"
      trailing={
        isUpdate ? undefined : (
          <Text variant="meta" tone="ink2">
            {copy.step}
          </Text>
        )
      }
      dock={
        <Button
          label={copy.agree}
          onPress={() => void agree()}
          disabled={!checked || saving}
          loading={saving}
          testID="rules-agree"
        />
      }
    >
      {isUpdate ? (
        <View style={styles.changes} testID="rules-changes">
          <Text variant="bodyStrong" accessibilityRole="header">
            {copy.whatChanged}
          </Text>
          {(changes.length ? changes : [copy.noChangeList]).map((line) => (
            <View key={line} style={styles.changeRow}>
              <Text variant="body" tone="ink2" accessible={false}>
                {'•'}
              </Text>
              <Text variant="body" style={styles.flex}>
                {line}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.rules}>
        {copy.items.map((rule) => (
          <View key={rule.title} style={styles.rule} accessible>
            <View style={styles.ruleIcon}>
              <Icon name={rule.icon as IconName} size={20} tone="ink" />
            </View>
            <View style={styles.flex}>
              <Text variant="bodyStrong">{rule.title}</Text>
              <Text variant="meta" tone="ink2">
                {rule.body}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.agreeRow}>
        <Tappable
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel={copy.agreeLabel}
          onPress={() => {
            haptic('selection');
            setChecked((c) => !c);
          }}
          guard={false}
          testID="rules-checkbox"
        >
          <View style={styles.boxHit}>
            <View style={styles.box(checked)}>
              {checked ? <Icon name="check" size={14} tone="inverse" /> : null}
            </View>
          </View>
        </Tappable>
        <Text variant="label" style={styles.flex}>
          {copy.agreeLabel}
        </Text>
      </View>
      <View style={styles.links}>
        {link('rules', copy.communityRules)}
        {link('terms', copy.terms)}
        {link('privacy', copy.privacy)}
      </View>

      {error ? (
        <Text variant="meta" tone="red" accessibilityLiveRegion="polite" testID="rules-error">
          {error}
        </Text>
      ) : null}
    </AuthStep>
  );
}

const styles = StyleSheet.create((theme) => ({
  full: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg,
  },
  changes: {
    gap: theme.space.sm,
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.bg2,
  },
  changeRow: { flexDirection: 'row', gap: theme.space.sm },
  rules: { gap: theme.space.lg },
  rule: { flexDirection: 'row', gap: theme.space.md, alignItems: 'flex-start' },
  ruleIcon: {
    width: theme.size.hit,
    height: theme.size.hit,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.bg2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    marginTop: theme.space.sm,
  },
  boxHit: {
    width: theme.size.hit,
    height: theme.size.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: (checked: boolean) => ({
    width: theme.space.xl,
    height: theme.space.xl,
    borderRadius: theme.radius.thumb / 2,
    borderWidth: 2,
    borderColor: theme.colors.ink,
    backgroundColor: checked ? theme.colors.ink : 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: theme.space.lg },
  linkHit: { minHeight: theme.size.hit, justifyContent: 'center' },
  link: { textDecorationLine: 'underline' },
}));
