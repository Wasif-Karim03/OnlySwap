import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Icon, type IconName } from './icons/Icon';
import { Text } from './Text';

/** Fills for the small iOS-style icon tile on grouped settings lists (DEC 90). */
export type IconTile = 'red' | 'sky' | 'ink' | 'green' | 'lilac' | 'ink3' | 'peach' | 'amber';

type RowProps = {
  label: string;
  value?: string;
  icon?: IconName;
  /**
   * Draws the icon white-on-color in a small rounded tile, the standard
   * settings look (Settings only, DEC 90). Without it the icon is plain.
   */
  iconTile?: IconTile;
  onPress?: () => void;
  destructive?: boolean;
  /** Custom right side (e.g. a toggle); replaces value + chevron. */
  right?: ReactNode;
  accessibilityHint?: string;
};

/** Settings-style row (F10): 52 pt min, optional icon, value and chevron. */
export function ListRow({
  label,
  value,
  icon,
  iconTile,
  onPress,
  destructive = false,
  right,
  accessibilityHint,
}: RowProps) {
  const content = (
    <>
      {icon && iconTile ? (
        <View style={styles.tile(iconTile)}>
          <Icon name={icon} size={18} tone="inverse" strokeWidth={2} />
        </View>
      ) : icon ? (
        <Icon name={icon} size={20} tone={destructive ? 'red' : 'ink'} />
      ) : null}
      <Text variant="body" tone={destructive ? 'red' : 'ink'} style={styles.label}>
        {label}
      </Text>
      {right ?? (
        <>
          {value ? (
            <Text variant="body" tone={iconTile ? 'ink3' : 'ink2'}>
              {value}
            </Text>
          ) : null}
          {onPress ? <Icon name="chev" size={18} tone="ink3" /> : null}
        </>
      )}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

/**
 * Grouped list (F10): bg2 block, hairlines between rows, optional header and
 * footer. `surface="card"`: white groups on a grey (bg2) page, the inset
 * settings look (DEC 90).
 */
export function GroupedList({
  header,
  footer,
  surface = 'bg2',
  children,
}: {
  header?: string;
  footer?: string;
  surface?: 'bg2' | 'card';
  children: ReactNode;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.section}>
      {header ? (
        <Text variant="meta" tone="ink2" accessibilityRole="header" style={styles.header}>
          {header.toUpperCase()}
        </Text>
      ) : null}
      <View style={styles.group(surface)}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 ? <View style={styles.divider} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <Text variant="meta" tone="ink2" style={styles.header}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    minHeight: theme.space.rowMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
  },
  pressed: { backgroundColor: theme.colors.bg3 },
  label: { flex: 1 },
  section: { gap: theme.space.sm },
  header: { paddingHorizontal: theme.space.lg },
  group: (surface: 'bg2' | 'card') => ({
    backgroundColor: theme.colors[surface],
    borderRadius: theme.radius.card,
    overflow: 'hidden',
  }),
  divider: { height: 1, marginLeft: theme.space.lg, backgroundColor: theme.colors.line },
  tile: (fill: IconTile) => ({
    width: theme.size.avatarS - theme.space.xs,
    height: theme.size.avatarS - theme.space.xs,
    borderRadius: theme.radius.thumb - theme.space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors[fill],
  }),
}));
