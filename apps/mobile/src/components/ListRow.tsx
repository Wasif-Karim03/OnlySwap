import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Icon, type IconName } from './icons/Icon';
import { Text } from './Text';

type RowProps = {
  label: string;
  value?: string;
  icon?: IconName;
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
  onPress,
  destructive = false,
  right,
  accessibilityHint,
}: RowProps) {
  const content = (
    <>
      {icon ? <Icon name={icon} size={20} tone={destructive ? 'red' : 'ink'} /> : null}
      <Text variant="body" tone={destructive ? 'red' : 'ink'} style={styles.label}>
        {label}
      </Text>
      {right ?? (
        <>
          {value ? (
            <Text variant="body" tone="ink2">
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

/** Grouped list (F10): bg2 block, hairlines between rows, optional header and footer. */
export function GroupedList({
  header,
  footer,
  children,
}: {
  header?: string;
  footer?: string;
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
      <View style={styles.group}>
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
  group: { backgroundColor: theme.colors.bg2, borderRadius: theme.radius.card, overflow: 'hidden' },
  divider: { height: 1, marginLeft: theme.space.lg, backgroundColor: theme.colors.line },
}));
