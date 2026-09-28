import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { fill } from '@/lib/format';
import { search as copy } from '@/strings/en';

import { Photo } from './Photo';
import { Tag } from './Tag';
import { Tappable } from './Tappable';
import { Text } from './Text';

export type TileState = 'default' | 'sold' | 'hold';

type Props = {
  title: string;
  price: string;
  photo: string | null;
  blurhash?: string | null;
  state?: TileState;
  /** A small line under the title, e.g. "Price dropped". */
  note?: string | null;
  onPress: () => void;
  testID?: string;
};

/** Grid tile (DESIGN_SYSTEM §6 ListingTile): default, sold (greyed + tag), hold (tag). */
export function ListingTile({
  title,
  price,
  photo,
  blurhash,
  state = 'default',
  note,
  onPress,
  testID,
}: Props) {
  const tag = state === 'sold' ? copy.tileSold : state === 'hold' ? copy.tileHold : null;
  const label = [fill(copy.tileLabel, { title, price }), tag, note].filter(Boolean).join('. ');
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
    >
      <View style={styles.tile(state === 'sold')}>
        <View>
          <Photo source={photo} blurhash={blurhash} rounded="thumb" />
          {tag ? (
            <View style={styles.tag}>
              <Tag label={tag} tone={state === 'hold' ? 'amber' : 'neutral'} />
            </View>
          ) : null}
        </View>
        <Text variant="bodyStrong" numberOfLines={1}>
          {price}
        </Text>
        <Text variant="meta" tone="ink2" numberOfLines={2}>
          {title}
        </Text>
        {note ? (
          <Text variant="meta" tone="green" numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
    </Tappable>
  );
}

const styles = StyleSheet.create((theme) => ({
  tile: (sold: boolean) => ({ gap: theme.space.xs, opacity: sold ? 0.5 : 1 }),
  tag: { position: 'absolute', top: theme.space.sm, left: theme.space.sm },
}));
