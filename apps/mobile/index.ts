// Unistyles must be configured before any StyleSheet is created (Unistyles
// Expo Router guide), and expo-router/entry loads every route module, so the
// theme import has to come first.
import './src/theme/unistyles';
import 'expo-router/entry';
