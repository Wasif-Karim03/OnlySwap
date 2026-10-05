import type { TypeVariant } from '@onlyswap/tokens';
import * as AgeRange from 'expo-age-range';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { createMMKV } from 'react-native-mmkv';
import Animated from 'react-native-reanimated';
import { StyleSheet, UnistylesRuntime } from 'react-native-unistyles';

import { SuccessCheck } from '@/components/SuccessCheck';
import { Text } from '@/components/Text';
import { MediaCheck } from '@/features/dev/MediaCheck';
import { SpotsMap } from '@/features/meetups/SpotsMap';
import { THEME_MODES, useThemeModeStore, type ThemeMode } from '@/theme/mode';
import { usePressFeedback } from '@/theme/motion';
import { dev, spotsMap } from '@/strings/en';
import { useReducedMotion } from '@/theme/reducedMotion';

/**
 * Dev builds only: P1-SPIKE-02/03/04 checks plus the S4 type, theme and motion
 * specimen. Removed with its route before store builds (see PR notes).
 */
const spikeStore = createMMKV({ id: 'spike' });

/** P1-SPIKE-02: one public and one police pin so both marker variants render. */
const SPIKE_SPOTS = [
  { id: 'spike-a', name: spotsMap.spikeSpot, lat: 39.9977, lng: -83.0086, police: false },
  { id: 'spike-b', name: spotsMap.spikeSpot, lat: 40.0016, lng: -83.0136, police: true },
];

const TYPE_ROWS: TypeVariant[] = [
  'display',
  'title',
  'heading',
  'price',
  'body',
  'bodyStrong',
  'label',
  'meta',
];

function DemoButton({
  label,
  hint,
  onPress,
}: {
  label: string;
  hint: string;
  onPress: () => void;
}) {
  const press = usePressFeedback();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={hint}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={[styles.button, press.animatedStyle]}>
        <Text variant="label" tone="onAccent">
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function SpikesScreen() {
  const [count, setCount] = useState(() => spikeStore.getNumber('count') ?? 0);
  const [age, setAge] = useState<string>(dev.ageNotAsked);
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const mode = useThemeModeStore((s) => s.mode);
  const setMode = useThemeModeStore((s) => s.setMode);
  const reduced = useReducedMotion();

  const bump = () => {
    const next = count + 1;
    spikeStore.set('count', next);
    setCount(next);
  };

  const askAge = async () => {
    try {
      const access = await AgeRange.requestAgeSignalsAccessAsync();
      const range = await AgeRange.requestAgeRangeAsync({ threshold1: 18 });
      const line = JSON.stringify({ access, range }, null, 1);
      console.warn('[SPIKE-03] age range', line);
      setAge(line);
    } catch (e) {
      const code = (e as { code?: string }).code ?? 'unknown';
      console.warn('[SPIKE-03] age range error', code);
      setAge(`${dev.ageUnknown} (${code})`);
    }
  };

  return (
    // Unistyles updates native views only; the third-party scroll view's
    // contentContainerStyle is not re-themed, so the background lives on a View.
    <View style={styles.screen}>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={styles.content}>
        <Text variant="title" accessibilityRole="header">
          {dev.title}
        </Text>

        <View style={styles.card}>
          <Text variant="label" tone="ink2">
            {dev.themeLabel}
          </Text>
          <Text variant="bodyStrong">{`${mode} (${UnistylesRuntime.themeName})`}</Text>
          <View style={styles.row}>
            {THEME_MODES.map((m: ThemeMode) => (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityState={{ selected: m === mode }}
                accessibilityHint={dev.themeHint}
                onPress={() => setMode(m)}
                style={[styles.segment, m === mode && styles.segmentOn]}
              >
                <Text variant="label" tone={m === mode ? 'onAccent' : 'ink'}>
                  {dev.themeModes[m]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text variant="label" tone="ink2">
            {dev.typeLabel}
          </Text>
          {TYPE_ROWS.map((v) => (
            <Text key={v} variant={v} testID={`type-${v}`}>
              {v === 'price' ? dev.typePrice : `${v} ${dev.typeSample}`}
            </Text>
          ))}
          <Text variant="meta" tone="ink2" overlay>
            {dev.typeOverlay}
          </Text>
        </View>

        <View style={styles.card}>
          <Text variant="label" tone="ink2">
            {reduced ? dev.motionReduced : dev.motionFull}
          </Text>
          <SuccessCheck visible={done} accessibilityLabel={dev.motionDone} />
          <DemoButton
            label={dev.motionButton}
            hint={dev.motionHint}
            onPress={() => setDone((d) => !d)}
          />
        </View>

        <View style={styles.card}>
          <Text variant="label" tone="ink2">
            {dev.mmkvLabel}
          </Text>
          <Text variant="price" testID="spike-mmkv-count">
            {count}
          </Text>
          <DemoButton label={dev.mmkvButton} hint={dev.mmkvHint} onPress={bump} />
        </View>

        <View style={styles.card}>
          <Text variant="label" tone="ink2">
            {dev.ageLabel}
          </Text>
          <Text variant="meta" testID="spike-age">
            {age}
          </Text>
          <DemoButton label={dev.ageButton} hint={dev.ageHint} onPress={askAge} />
        </View>

        <MediaCheck />

        <View style={styles.card} testID="spike-map">
          <Text variant="label" tone="ink2">
            {spotsMap.spike}
          </Text>
          <SpotsMap spots={SPIKE_SPOTS} selectedId={pin} onSelect={setPin} />
        </View>

        <View style={styles.card}>
          <Text variant="label" tone="ink2">
            {dev.keyboardLabel}
          </Text>
          <TextInput
            accessibilityLabel={dev.keyboardLabel}
            accessibilityHint={dev.keyboardHint}
            value={text}
            onChangeText={setText}
            placeholder={dev.keyboardPlaceholder}
            style={styles.input}
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: {
    padding: theme.space.screen,
    paddingTop: rt.insets.top + theme.space.lg,
    paddingBottom: rt.insets.bottom + theme.space.xl,
    gap: theme.space.lg,
  },
  card: {
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.card,
    padding: theme.space.lg,
    gap: theme.space.sm,
  },
  row: { flexDirection: 'row', gap: theme.space.sm },
  segment: {
    flex: 1,
    minHeight: theme.space.xl + theme.space.lg + theme.space.xs,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.bg3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: { backgroundColor: theme.colors.accent },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.control,
    minHeight: theme.space.xl + theme.space.lg + theme.space.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: theme.space.xl + theme.space.lg + theme.space.xs,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.control,
    paddingHorizontal: theme.space.md,
    color: theme.colors.ink,
    fontSize: theme.type.body.fontSize,
  },
}));
