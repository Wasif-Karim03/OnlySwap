import { size } from '@onlyswap/tokens';
import { Platform, Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { fill } from '@/lib/format';
import { nav as navCopy, welcome as brandCopy } from '@/strings';
import { LAYOUT } from '@/theme/layout';

import { Icon, type IconName } from './icons/Icon';
import { Mark } from './Mark';
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
  /**
   * `bar`: bottom tabs. `rail`: the iPad sidebar on wide windows (board N5/N6
   * `aside`): wordmark, then one row per tab with icon and label.
   */
  layout?: 'bar' | 'rail';
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
  layout = 'bar',
  testID,
}: Props) {
  if (layout === 'rail') {
    return (
      <TabRail
        items={items}
        activeKey={activeKey}
        onSelect={onSelect}
        onLongPress={onLongPress}
        testID={testID}
      />
    );
  }
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

/** iPad sidebar (board N5/N6): same tabs, roles and badges as the bar, stacked. */
function TabRail({
  items,
  activeKey,
  onSelect,
  onLongPress,
  testID,
}: Pick<Props, 'items' | 'activeKey' | 'onSelect' | 'onLongPress' | 'testID'>) {
  return (
    <View testID={testID} style={styles.rail}>
      <View style={styles.brand}>
        <Mark size={size.avatarS} tone="accent" />
        <Text variant="heading" style={styles.wordmark}>
          {brandCopy.wordmark}
        </Text>
      </View>
      <View accessibilityRole="tablist" style={styles.railItems}>
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
              style={styles.railItem(active)}
            >
              <Icon
                name={item.icon}
                size={size.tabIcon}
                tone={active ? 'ink' : 'ink2'}
                strokeWidth={active ? 2.2 : 1.8}
              />
              <Text
                variant="bodyStrong"
                tone={active ? 'ink' : 'ink2'}
                overlay
                numberOfLines={1}
                style={styles.railLabel}
              >
                {item.label}
              </Text>
              {badge ? (
                <View style={styles.railBadge}>
                  <Text variant="meta" tone="inverse" overlay style={styles.badgeText}>
                    {badge}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  rail: {
    width: LAYOUT.railWidth,
    paddingTop: rt.insets.top + theme.space.xl,
    paddingBottom: rt.insets.bottom + theme.space.lg,
    paddingHorizontal: theme.space.md,
    backgroundColor: theme.colors.bg2,
    borderRightWidth: 1,
    borderRightColor: theme.colors.line,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.sm,
    paddingBottom: theme.space.xl,
  },
  wordmark: { fontWeight: '800' },
  railItems: { gap: theme.space.xs },
  railItem: (active: boolean) => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.size.hit,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radius.thumb,
    backgroundColor: active ? theme.colors.bg : 'transparent',
  }),
  railLabel: { flex: 1 },
  railBadge: {
    minWidth: theme.size.badge,
    minHeight: theme.size.badge,
    paddingHorizontal: theme.space.xs,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.red,
  },
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
