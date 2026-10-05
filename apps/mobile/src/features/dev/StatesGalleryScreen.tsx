import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { GroupedList, ListRow } from '@/components/ListRow';
import { NavBar } from '@/components/NavBar';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { fill } from '@/lib/format';
import { statesFx as fx } from '@/strings';

import { FrameBody, findFrame, STATE_FRAMES, type StateFrame } from './stateFrames';

function releaseTag(frame: StateFrame) {
  if (frame.release === '1.0') return null;
  return (
    <Tag
      tone="neutral"
      label={
        frame.release === 'removed' ? fx.notInR10 : fill(fx.release, { release: frame.release })
      }
    />
  );
}

/** Dev builds only (P2-KIT-02): list of every board X frame. */
export function StatesGalleryScreen() {
  return (
    <View style={styles.screen}>
      <NavBar title={fx.title} onLeading={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="body" tone="ink2">
          {fx.intro}
        </Text>
        <GroupedList>
          {STATE_FRAMES.map((frame) => (
            <ListRow
              key={frame.id}
              label={`${frame.id} ${frame.name}`}
              right={releaseTag(frame) ?? undefined}
              onPress={() =>
                router.push({ pathname: '/dev/states/[id]', params: { id: frame.id } })
              }
            />
          ))}
        </GroupedList>
      </ScrollView>
    </View>
  );
}

/** One frame, full screen, with its release and owning screen. */
export function StateFrameScreen({ id }: { id: string | undefined }) {
  const frame = findFrame(id);
  if (!frame) return <StatesGalleryScreen />;
  return (
    <View style={styles.screen} testID={`state-${frame.id}`}>
      <NavBar
        title={`${frame.id} ${frame.name}`}
        onLeading={() => router.back()}
        trailing={releaseTag(frame)}
      />
      <Text variant="meta" tone="ink2" style={styles.caption}>
        {fill(fx.realScreen, { screen: frame.screen })}
      </Text>
      <FrameBody frame={frame} />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: {
    padding: theme.space.screen,
    paddingBottom: rt.insets.bottom + theme.space['2xl'],
    gap: theme.space.lg,
  },
  caption: { paddingHorizontal: theme.space.screen },
}));
