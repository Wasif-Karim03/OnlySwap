import { size } from '@onlyswap/tokens';
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { fill } from '@/lib/format';
import { nav as navCopy, welcome as brandCopy } from '@/strings';
import { LAYOUT } from '@/theme/layout';
import { liftShadow } from '@/theme/shadow';

import { badgeText, CountPill } from './Badge';
import { Icon, type IconName } from './icons/Icon';
import { Mark } from './Mark';
import { Material } from './Material';
import { Text } from './Text';
import { a11yState } from '@/lib/a11y';

export type TabItem = {
  key: string;
  label: string;
  icon: IconName;
  /** Unread count; 0 or undefined hides the badge. */
  badge?: number;
  /**
   * The center Sell tab (DEC 90): an accent-filled rounded rectangle with the
   * icon and no visible label. Screen readers still hear the label.
   */
  prominent?: boolean;
};

export type TabBarVariant = 'ios' | 'android';

/** Pressed tabs dim to this opacity (DESIGN_REVIEW 3.08 TabBar). */
const PRESSED_OPACITY = 0.6;

// The badge rule lives next to Badge; re-exported here for existing imports.
export { badgeText };

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
  /**
   * Labels under icons on every platform (owner, 2026-10-15): the Android pill
   * (board N1) is kept for the component kit only.
   */
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
 * Labels are capped at 1.4x Dynamic Type so four tabs always fit. DEC 90:
 * white bar with a hairline on top, ink when on and ink3 when off, and the
 * prominent (Sell) tab as an accent rounded rectangle in the middle.
 */
export function TabBar({
  items,
  activeKey,
  onSelect,
  onLongPress,
  variant = 'ios',
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
  return (
    <View style={styles.bar(safeBottom)}>
      <View style={styles.lift}>
        <Material testID={testID} accessibilityRole="tablist" style={styles.capsule}>
          {items.map((item) => {
            const active = item.key === activeKey;
            return (
              <Pressable
                key={item.key}
                testID={testID ? `${testID}-${item.key}` : undefined}
                accessibilityRole="tab"
                accessibilityLabel={tabAccessibilityLabel(item)}
                {...a11yState({ selected: active })}
                onPress={() => onSelect(item.key)}
                onLongPress={onLongPress ? () => onLongPress(item.key) : undefined}
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}
              >
                <View
                  style={item.prominent ? styles.prominent : styles.iconWrap(active)}
                  testID={item.prominent && testID ? `${testID}-${item.key}-prominent` : undefined}
                >
                  <Icon
                    name={item.icon}
                    size={size.tabIcon}
                    tone={item.prominent ? 'onAccent' : active ? 'inverse' : 'ink3'}
                    strokeWidth={active || item.prominent ? 2.2 : 1.8}
                  />
                  <CountPill count={item.badge} hidden={false} style={styles.badge} />
                </View>
                {item.prominent ? null : (
                  <Text
                    variant="meta"
                    tone={active ? 'ink' : 'ink3'}
                    overlay
                    numberOfLines={1}
                    style={styles.label}
                  >
                    {item.label}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </Material>
      </View>
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
          return (
            <Pressable
              key={item.key}
              testID={testID ? `${testID}-${item.key}` : undefined}
              accessibilityRole="tab"
              accessibilityLabel={tabAccessibilityLabel(item)}
              {...a11yState({ selected: active })}
              onPress={() => onSelect(item.key)}
              onLongPress={onLongPress ? () => onLongPress(item.key) : undefined}
              style={({ pressed }) => [styles.railItem(active), pressed && styles.pressed]}
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
              <CountPill count={item.badge} hidden={false} />
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
  // Pressed: icon and label dim; nothing scales, so the row never shifts (3.08 TabBar).
  pressed: { opacity: PRESSED_OPACITY },
  // Round 2 (design/system.md 7.2): a floating capsule inset from the edges,
  // on the material surface with a hairline and one soft shadow. It stays in
  // the layout flow, so no screen's bottom padding changes.
  bar: (safeBottom: boolean) => ({
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: (safeBottom ? rt.insets.bottom : 0) + theme.space.md,
    backgroundColor: theme.colors.bg,
  }),
  // One soft shadow, on a wrapper: the material clips its own edges.
  lift: { borderRadius: theme.radius.chip, ...liftShadow() },
  capsule: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    minHeight: theme.size.hit + theme.space.xl - theme.space.xs,
    paddingHorizontal: theme.space.xs,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radius.chip,
  },
  label: { fontWeight: '600' },
  prominent: {
    width: theme.size.tabPillH + theme.space.md + theme.space.xs,
    height: theme.size.tabPillH + theme.space.xs,
    borderRadius: theme.radius.thumb,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: theme.space.xs,
    minHeight: theme.size.hit,
  },
  // The selected tab sits on an ink pill (selection is ink, not accent).
  iconWrap: (active: boolean) => ({
    width: theme.size.tabPillW - theme.space.md,
    height: theme.size.tabPillH,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: active ? theme.colors.ink : 'transparent',
  }),
  badge: {
    position: 'absolute',
    top: -theme.space.xs,
    left: (theme.size.tabPillW - theme.space.md) / 2 + theme.space.sm,
  },
}));
