import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { Mark } from '@/components/Mark';
import { Text } from '@/components/Text';
import { welcome as copy } from '@/strings/en';

import { WELCOME_HERO, WELCOME_ITEMS } from './welcomeAssets';

/**
 * S-A02 Welcome (P4-AUTH-04, board A2): a campus photo with real listings
 * floating on it, one headline, one main action.
 */
export function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root} testID="screen-welcome">
      <StatusBar style="light" />
      <View
        style={styles.hero}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {WELCOME_HERO ? (
          <Image
            source={WELCOME_HERO}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}
        <Scrim />
        <View style={[styles.brand, { paddingTop: insets.top }]}>
          <Mark size={28} tone="accent" />
          <Text variant="heading" tone="onPhoto" overlay style={styles.wordmark}>
            {copy.wordmark}
          </Text>
        </View>
        <View style={styles.floats}>
          {copy.samples.map((s, i) => (
            <View key={s.title} style={styles.mini(i)}>
              <Image
                source={WELCOME_ITEMS[i]}
                style={styles.miniThumb}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
              <View style={styles.miniText}>
                <Text variant="label" overlay numberOfLines={1}>
                  {s.title}
                </Text>
                <Text variant="meta" tone="ink2" overlay numberOfLines={1}>
                  <Text variant="meta" overlay style={styles.price}>
                    {s.price}
                  </Text>
                  {` · ${s.place}`}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.content, { paddingBottom: insets.bottom + styles.dockGap.height }]}>
        <Text variant="display" accessibilityRole="header">
          {copy.title}
        </Text>
        <Text variant="body" tone="ink2" style={styles.body}>
          {copy.body}
        </Text>
        <View style={styles.actions}>
          <Button
            label={copy.continue}
            onPress={() => router.push('/email')}
            testID="welcome-continue"
          />
          <Button
            label={copy.signIn}
            variant="text"
            accessibilityHint={copy.signInHint}
            onPress={() => router.push('/email?mode=login')}
            testID="welcome-sign-in"
          />
        </View>
      </View>
    </View>
  );
}

/** The one allowed gradient: a photo scrim so the wordmark reads (DESIGN_SYSTEM §8). */
function Scrim() {
  const { theme } = useUnistyles();
  const scrim = theme.colors.overlay;
  return (
    <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 1 1">
      <Defs>
        <LinearGradient id="welcomeScrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={scrim} stopOpacity={0.9} />
          <Stop offset="0.32" stopColor={scrim} stopOpacity={0} />
          <Stop offset="0.62" stopColor={scrim} stopOpacity={0} />
          <Stop offset="1" stopColor={scrim} stopOpacity={0.55} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="1" height="1" fill="url(#welcomeScrim)" />
    </Svg>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  hero: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: theme.colors.photoBg,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.screen,
    marginTop: theme.space.sm,
  },
  wordmark: { fontWeight: '800' },
  floats: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingBottom: theme.space.xl,
  },
  // Staggered like the board: left, right, left.
  mini: (i: number) => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    alignSelf: i % 2 === 0 ? 'flex-start' : 'flex-end',
    marginLeft: i === 2 ? theme.space.xl : 0,
    maxWidth: '78%',
    padding: theme.space.sm,
    paddingRight: theme.space.md,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.card,
  }),
  miniThumb: {
    width: theme.size.avatarM,
    height: theme.size.avatarM,
    borderRadius: theme.radius.thumb,
    backgroundColor: theme.colors.bg2,
  },
  miniText: { flexShrink: 1 },
  price: { color: theme.colors.ink, fontWeight: '700' },
  content: {
    paddingTop: theme.space.xl,
    paddingHorizontal: theme.space.screen,
  },
  body: { marginTop: theme.space.sm },
  actions: { marginTop: theme.space.xl, gap: theme.space.xs },
  dockGap: { height: theme.space.md },
}));
