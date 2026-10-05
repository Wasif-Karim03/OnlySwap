import { Camera, Map as MapView, Marker } from '@maplibre/maplibre-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { spotsMap as copy } from '@/strings';
import { useReducedMotion } from '@/theme/reducedMotion';

import type { Spot } from '../sell/logic';
import { mapStyleFor, spotsBounds, validCoord } from './logic';

export type MapSpot = Pick<Spot, 'id' | 'name' | 'lat' | 'lng' | 'police'>;

/** Close enough to read the building, far enough to see the street around it. */
export const MAX_ZOOM = 17;

/**
 * R11-MAP-01 spots map (MapLibre + OpenFreeMap). Shows the campus Meetup spots
 * only: no user location, no location permission. The list under it is the
 * primary, accessible UI, so the map is hidden from screen readers and the
 * selection here mirrors the list's. If the style or tiles fail to load the
 * whole section goes away and the list carries on alone (no blank box).
 */
export function SpotsMap({
  spots,
  selectedId = null,
  onSelect,
  testID = 'spots-map',
}: {
  spots: readonly MapSpot[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(true);
  const [failed, setFailed] = useState(false);

  const shown = spots.filter(validCoord);
  const bounds = spotsBounds(shown);
  if (failed || !bounds) return null;

  const label = open ? copy.hide : copy.show;
  const pad = theme.space.xl;

  return (
    <View style={styles.wrap}>
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={styles.toggleHit}
        testID={`${testID}-toggle`}
      >
        <View style={styles.toggle}>
          <Text variant="label" tone="ink2">
            {label}
          </Text>
        </View>
      </Tappable>
      {open ? (
        <>
          <View
            style={styles.frame}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            testID={testID}
          >
            <MapView
              style={styles.map}
              mapStyle={mapStyleFor(theme.mode)}
              logo={false}
              compass={false}
              touchRotate={false}
              touchPitch={false}
              attribution
              attributionPosition={{ bottom: theme.space.xs, right: theme.space.xs }}
              onDidFailLoadingMap={() => setFailed(true)}
              testID={`${testID}-native`}
            >
              <Camera
                bounds={bounds}
                padding={{ top: pad, right: pad, bottom: pad, left: pad }}
                maxZoom={MAX_ZOOM}
                duration={reduced ? 0 : theme.motion.success.duration}
                easing={reduced ? undefined : 'ease'}
                testID={`${testID}-camera`}
              />
              {shown.map((s) => {
                const selected = s.id === selectedId;
                return (
                  <Marker
                    key={s.id}
                    id={s.id}
                    lngLat={[s.lng, s.lat]}
                    anchor="center"
                    selected={selected}
                    onPress={() => onSelect?.(s.id)}
                    testID={`spot-marker-${s.id}`}
                  >
                    <View style={styles.hit}>
                      <View
                        style={styles.pin(s.police, selected)}
                        testID={`spot-pin-${s.id}-${s.police ? 'police' : 'public'}${selected ? '-selected' : ''}`}
                      />
                    </View>
                  </Marker>
                );
              })}
            </MapView>
          </View>
          <Text variant="meta" tone="ink3">
            {copy.attribution}
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: { gap: theme.space.sm },
  toggleHit: { alignSelf: 'flex-start' },
  toggle: {
    minHeight: theme.size.hit,
    justifyContent: 'center',
  },
  frame: {
    aspectRatio: 16 / 10,
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    backgroundColor: theme.colors.bg2,
  },
  map: { flex: 1 },
  hit: {
    width: theme.size.hit,
    height: theme.size.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Public spots: accent fill. Police-designated: the police Tag palette
  // (green on greenBg). Selected: enlarged, with an ink ring.
  pin: (police: boolean, selected: boolean) => ({
    width: selected ? theme.size.avatarS : theme.size.badge,
    height: selected ? theme.size.avatarS : theme.size.badge,
    borderRadius: theme.radius.avatar,
    borderWidth: selected ? theme.space.xs : theme.space.xs / 2,
    borderColor: selected ? theme.colors.ink : police ? theme.colors.green : theme.colors.bg,
    backgroundColor: police ? theme.colors.greenBg : theme.colors.accent,
  }),
}));
