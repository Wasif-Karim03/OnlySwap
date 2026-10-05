import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { SegmentedControl } from '@/components/SegmentedControl';
import { campus as copy } from '@/strings';

type View_ = 'swipe' | 'campus';

/**
 * D19: "Swipe | Around campus" under the Discover title. Both sides live in
 * the Discover stack (B01 index, C01 campus); switching replaces the screen
 * so Back never bounces between them.
 */
export function DiscoverSegment({ value }: { value: View_ }) {
  const router = useRouter();
  return (
    <View style={styles.wrap} testID="discover-segment">
      <SegmentedControl<View_>
        label={copy.segmentLabel}
        segments={[
          { value: 'swipe', label: copy.segmentSwipe },
          { value: 'campus', label: copy.segmentCampus },
        ]}
        value={value}
        onChange={(next) => {
          if (next === value) return;
          router.replace(next === 'campus' ? '/discover/campus' : '/discover');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: { paddingHorizontal: theme.space.screen, paddingBottom: theme.space.sm },
}));
