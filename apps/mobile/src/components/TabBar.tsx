import { size } from '@onlyswap/tokens';
import { Platform, Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { fill } from '@/lib/format';
import { nav as navCopy } from '@/strings';

import { Icon, type IconName } from './icons/Icon';
import { Text } from './Text';

export type TabItem = {
  key: string;
  label: string;
  icon: IconName;
  /** Unread count; 0 or undefined hides the badge. */
  badge?: number;
};

export type TabBarVariant = 'ios' | 'android';

/** Badge text: nothing for 0, the number up to 99, then "99+". */
export function badgeText(count: number | undefined): string | null {
  if (!count || count < 1) return null;
  return count > 99 ? '99+' : String(Math.floor(count));
}

/** Spoken name of a tab, with its unread count. */
export function tabAccessibilityLabel(item: TabItem): string {
  const badge = badgeText(item.badge);
  return badge ? fill(navCopy.tabWithBadge, { label: item.label, count: badge }) : item.label;
}

type Props = {
  items: TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  onLongPress?: (key: string) => void;
  /** Defaults to the platform: iOS labels under icons, Android pill (board N1). */
  variant?: TabBarVariant;
  /** Adds the home-indicator inset. Off in the component kit preview. */
  safeBottom?: boolean;
  testID?: string;
};

/**
 * Bottom tabs (P2-CMP-09). Tabs never slide or buzz (haptics budget, UX-09).
 * Labels are capped at 1.4x Dynamic Type so four tabs always fit.
 */
export function TabBar({
  items,
  activeKey,
  onSelect,
  onLongPress,
  variant = Platform.OS === 'android' ? 'android' : 'ios',
  safeBottom = true,
  testID,
}: Props) {
  const android = variant === 'android';
  return (
    <View testID={testID} accessibilityRole="tablist" style={styles.bar(android, safeBottom)}>
      {items.map((item) => {
        const active = item.key === activeKey;
        const badge = badgeText(item.badge);
        return (
          <Pressable
            key={item.key}
            testID={testID ? `${testID}-${item.key}` : undefined}
            accessibilityRole="tab"
            accessibilityLabel={tabAccessibilityLabel(item)}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(item.key)}
            onLongPress={onLongPress ? () => onLongPress(item.key) : undefined}
            style={styles.item}
          >
            <View style={styles.iconWrap(android, active)}>
              <Icon
                name={item.icon}
                size={size.tabIcon}
                tone={android && active ? 'onAccent' : active ? 'ink' : 'ink2'}
                strokeWidth={active ? 2.2 : 1.8}
              />
              {badge ? (
                <View style={styles.badge(android)}>
                  <Text variant="meta" tone="inverse" overlay style={styles.badgeText}>
                    {badge}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text variant="meta" tone={active ? 'ink' : 'ink2'} overlay numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  bar: (android: boolean, safeBottom: boolean) => ({
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: android ? theme.space.md : theme.space.sm,
    paddingBottom:
      (safeBottom ? rt.insets.bottom : 0) + (android ? theme.space.md : theme.space.xs),
    backgroundColor: android ? theme.colors.bg2 : theme.colors.bg,
    borderTopWidth: android ? 0 : 1,
    borderTopColor: theme.colors.line,
  }),
  item: {
    flex: 1,
    alignItems: 'center',
    gap: theme.space.xs,
    minHeight: theme.size.hit,
  },
  iconWrap: (android: boolean, active: boolean) => ({
    width: android ? theme.size.tabPillW : theme.size.tabIcon,
    height: android ? theme.size.tabPillH : theme.size.tabIcon,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: android && active ? theme.colors.accent : 'transparent',
  }),
  badge: (android: boolean) => ({
    position: 'absolute',
    top: android ? 0 : -theme.space.xs,
    left: android ? theme.size.tabPillW / 2 + theme.space.sm : theme.space.lg,
    minWidth: theme.size.badge,
    minHeight: theme.size.badge,
    paddingHorizontal: theme.space.xs,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.red,
  }),
  badgeText: { fontWeight: '700', lineHeight: theme.size.badge },
}));
