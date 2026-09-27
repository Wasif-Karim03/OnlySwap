import * as AgeRange from 'expo-age-range';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { createMMKV } from 'react-native-mmkv';
import { StyleSheet, UnistylesRuntime } from 'react-native-unistyles';

import { dev } from '@/strings/en';

/**
 * P1-SPIKE-03 / P1-SPIKE-04 (dev builds only). Proves MMKV v4, Unistyles 3 and
 * keyboard-controller run in the dev client, and logs the OS age signal.
 * Removed with its route once the spikes are recorded (P11-A11Y-01 cleanup).
 */
const spikeStore = createMMKV({ id: 'spike' });

function describeAgeResult(result: unknown): string {
  return JSON.stringify(result, null, 1);
}

export function SpikesScreen() {
  const [count, setCount] = useState(() => spikeStore.getNumber('count') ?? 0);
  const [age, setAge] = useState<string>(dev.ageNotAsked);
  const [text, setText] = useState('');

  const bump = () => {
    const next = count + 1;
    spikeStore.set('count', next);
    setCount(next);
  };

  const toggleTheme = () => {
    UnistylesRuntime.setAdaptiveThemes(false);
    UnistylesRuntime.setTheme(UnistylesRuntime.themeName === 'dark' ? 'light' : 'dark');
  };

  const askAge = async () => {
    try {
      const access = await AgeRange.requestAgeSignalsAccessAsync();
      const range = await AgeRange.requestAgeRangeAsync({ threshold1: 18 });
      const line = describeAgeResult({ access, range });
      console.warn('[SPIKE-03] age range', line);
      setAge(line);
    } catch (e) {
      const code = (e as { code?: string }).code ?? 'unknown';
      console.warn('[SPIKE-03] age range error', code);
      setAge(`${dev.ageUnknown} (${code})`);
    }
  };

  return (
    <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        {dev.title}
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>{dev.mmkvLabel}</Text>
        <Text testID="spike-mmkv-count" style={styles.value}>
          {count}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityHint={dev.mmkvHint}
          onPress={bump}
          style={styles.button}
        >
          <Text style={styles.buttonText}>{dev.mmkvButton}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{dev.unistylesLabel}</Text>
        <Text style={styles.value}>{UnistylesRuntime.themeName}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityHint={dev.unistylesHint}
          onPress={toggleTheme}
          style={styles.button}
        >
          <Text style={styles.buttonText}>{dev.unistylesButton}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{dev.ageLabel}</Text>
        <Text testID="spike-age" style={styles.mono}>
          {age}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityHint={dev.ageHint}
          onPress={askAge}
          style={styles.button}
        >
          <Text style={styles.buttonText}>{dev.ageButton}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{dev.keyboardLabel}</Text>
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
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    padding: theme.space(4),
    gap: theme.space(4),
    backgroundColor: theme.colors.bg,
    minHeight: '100%',
  },
  title: { color: theme.colors.ink, fontSize: 26, fontWeight: '800' },
  card: {
    backgroundColor: theme.colors.bg2,
    borderRadius: 16,
    padding: theme.space(4),
    gap: theme.space(2),
  },
  label: { color: theme.colors.ink2, fontSize: 13, fontWeight: '600' },
  value: { color: theme.colors.ink, fontSize: 22, fontWeight: '700' },
  mono: { color: theme.colors.ink, fontSize: 12, fontFamily: 'Menlo' },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: theme.colors.onAccent, fontSize: 15, fontWeight: '700' },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 12,
    paddingHorizontal: theme.space(3),
    color: theme.colors.ink,
  },
}));
