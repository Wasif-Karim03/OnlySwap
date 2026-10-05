import { useTheme } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { shell } from '@/strings';

type Props = {
  testID: string;
};

/**
 * Temporary tab body for the S1 scaffold. Each tab replaces it with its real
 * screen in its own session (DESIGN_SYSTEM §10: B01, D01, E01, F01).
 */
export function ShellScreen({ testID }: Props) {
  const { colors } = useTheme();

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="summary"
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      <Text style={{ color: colors.text }}>{shell.comingSoon}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
