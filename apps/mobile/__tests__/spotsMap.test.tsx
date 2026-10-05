import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactElement, ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';

import type { MeetupsApi } from '../src/features/meetups/api';
import {
  MAP_STYLES,
  MIN_SPAN_DEG,
  mapStyleFor,
  spotsBounds,
  validCoord,
} from '../src/features/meetups/logic';
import { PlanMeetupScreen } from '../src/features/meetups/PlanMeetupScreen';
import { MAX_ZOOM, SpotsMap, type MapSpot } from '../src/features/meetups/SpotsMap';
import { SafetyCenterScreen } from '../src/features/safety/SafetyScreens';
import type { Spot } from '../src/features/sell/logic';
import { spotsMap } from '../src/strings/en';

const HIDDEN = { includeHiddenElements: true } as const;

const SPOTS: MapSpot[] = [
  { id: 'a', name: 'Union lobby', lat: 39.9977, lng: -83.0086, police: false },
  { id: 'b', name: 'Police station lobby', lat: 40.0016, lng: -83.0136, police: true },
];

const fullSpots: Spot[] = SPOTS.map((s, i) => ({
  ...s,
  description: null,
  hours: null,
  isDefault: false,
  sort: i,
}));

afterEach(() => jest.restoreAllMocks());

/** Renders and lets the reduce-motion lookup settle inside act. */
async function renderMap(ui: ReactElement) {
  const r = render(ui);
  await act(async () => {});
  return r;
}

describe('T-UNIT-MAP-01 spotsBounds and style (R11-MAP-01)', () => {
  it('contains every spot, west/south/east/north', () => {
    expect(spotsBounds(SPOTS)).toEqual([-83.0136, 39.9977, -83.0086, 40.0016]);
  });

  it('widens a single spot to the minimum span, centered on it', () => {
    const [w, s, e, n] = spotsBounds([{ lat: 40, lng: -83 }])!;
    expect(e - w).toBeCloseTo(MIN_SPAN_DEG);
    expect(n - s).toBeCloseTo(MIN_SPAN_DEG);
    expect((w + e) / 2).toBeCloseTo(-83);
    expect((s + n) / 2).toBeCloseTo(40);
  });

  it('skips unusable coordinates and returns null when nothing is left', () => {
    expect(validCoord({ lat: 0, lng: 0 })).toBe(false);
    expect(validCoord({ lat: Number.NaN, lng: 1 })).toBe(false);
    expect(validCoord({ lat: 91, lng: 1 })).toBe(false);
    expect(spotsBounds([])).toBeNull();
    expect(spotsBounds([{ lat: 0, lng: 0 }])).toBeNull();
    expect(spotsBounds([{ lat: 0, lng: 0 }, ...SPOTS])).toEqual(spotsBounds(SPOTS));
  });

  it('uses keyless OpenFreeMap styles, light and dark', () => {
    expect(mapStyleFor('light')).toBe(MAP_STYLES.light);
    expect(mapStyleFor('dark')).toBe(MAP_STYLES.dark);
    for (const url of Object.values(MAP_STYLES)) {
      expect(url).toMatch(/^https:\/\/tiles\.openfreemap\.org\/styles\/[a-z]+$/);
    }
  });
});

describe('T-UNIT-MAP-02 SpotsMap', () => {
  it('draws one marker per spot, police-designated pins in the police style', async () => {
    await renderMap(<SpotsMap spots={SPOTS} />);
    expect(screen.getByTestId('spot-pin-a-public', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('spot-pin-b-police', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('spot-marker-b', HIDDEN).props.lngLat).toEqual([-83.0136, 40.0016]);
    expect(screen.getByText(spotsMap.attribution)).toBeTruthy();
  });

  it('fits the camera to all spots with padding, animated unless reduce motion', async () => {
    await renderMap(<SpotsMap spots={SPOTS} />);
    const cam = screen.getByTestId('spots-map-camera', HIDDEN);
    expect(cam.props.bounds).toEqual(spotsBounds(SPOTS));
    expect(cam.props.padding.top).toBeGreaterThan(0);
    expect(cam.props.maxZoom).toBe(MAX_ZOOM);
    await waitFor(() =>
      expect(screen.getByTestId('spots-map-camera', HIDDEN).props.duration).toBeGreaterThan(0),
    );
  });

  it('reduce motion: no camera animation', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await renderMap(<SpotsMap spots={SPOTS} />);
    await waitFor(() =>
      expect(screen.getByTestId('spots-map-camera', HIDDEN).props.duration).toBe(0),
    );
  });

  it('is hidden from screen readers (the list has the same info)', async () => {
    await renderMap(<SpotsMap spots={SPOTS} />);
    const frame = screen.getByTestId('spots-map', HIDDEN);
    expect(frame.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(frame.props.accessibilityElementsHidden).toBe(true);
    expect(screen.queryByTestId('spots-map')).toBeNull();
  });

  it('tapping a marker selects the spot; the selected pin is enlarged', async () => {
    const onSelect = jest.fn();
    const { rerender } = await renderMap(<SpotsMap spots={SPOTS} onSelect={onSelect} />);
    fireEvent.press(screen.getByTestId('spot-marker-b', HIDDEN));
    expect(onSelect).toHaveBeenCalledWith('b');
    rerender(<SpotsMap spots={SPOTS} selectedId="b" onSelect={onSelect} />);
    expect(screen.getByTestId('spot-pin-b-police-selected', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('spot-marker-b', HIDDEN).props.selected).toBe(true);
    expect(screen.getByTestId('spot-pin-a-public', HIDDEN)).toBeTruthy();
  });

  it('collapses and expands with a labelled button', async () => {
    await renderMap(<SpotsMap spots={SPOTS} />);
    fireEvent.press(screen.getByRole('button', { name: spotsMap.hide }));
    expect(screen.queryByTestId('spots-map', HIDDEN)).toBeNull();
    // Past the 500 ms double-tap guard on Tappable.
    const later = Date.now() + 1000;
    jest.spyOn(Date, 'now').mockReturnValue(later);
    fireEvent.press(screen.getByRole('button', { name: spotsMap.show }));
    expect(screen.getByTestId('spots-map', HIDDEN)).toBeTruthy();
  });

  it('style or tile failure hides the whole map section (no blank box)', async () => {
    await renderMap(<SpotsMap spots={SPOTS} />);
    fireEvent(screen.getByTestId('spots-map-native', HIDDEN), 'didFailLoadingMap');
    expect(screen.queryByTestId('spots-map', HIDDEN)).toBeNull();
    expect(screen.queryByRole('button', { name: spotsMap.hide })).toBeNull();
    expect(screen.queryByText(spotsMap.attribution)).toBeNull();
  });

  it('renders nothing when no spot has a usable coordinate', async () => {
    await renderMap(<SpotsMap spots={[{ id: 'x', name: 'X', lat: 0, lng: 0, police: false }]} />);
    expect(screen.queryByTestId('spots-map-toggle', HIDDEN)).toBeNull();
  });
});

function renderScreen(routes: Record<string, () => ReactNode>, initialUrl: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderRouter({ index: () => null, ...routes }, { initialUrl, wrapper });
}

describe('T-UNIT-MAP-03 map and list stay in sync', () => {
  it('Plan the pickup: a marker picks the radio row, a row enlarges its marker', async () => {
    const api = { propose: jest.fn() } as unknown as MeetupsApi;
    renderScreen(
      {
        'chat/[id]/meetup': () => (
          <PlanMeetupScreen chatId="c1" api={api} spots={async () => fullSpots} />
        ),
      },
      '/chat/c1/meetup',
    );
    await screen.findByText('Union lobby');
    fireEvent.press(screen.getByTestId('spot-marker-b', HIDDEN));
    const police = screen.getByRole('radio', { name: /Police station lobby/ });
    expect(police.props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByTestId('spot-pin-b-police-selected', HIDDEN)).toBeTruthy();

    fireEvent.press(screen.getByText('Union lobby'));
    expect(screen.getByTestId('spot-pin-a-public-selected', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('spot-pin-b-police', HIDDEN)).toBeTruthy();
  });

  it('Safety center: a marker highlights its row; Directions still opens Maps', async () => {
    const openUrl = jest.fn(async () => {});
    renderScreen(
      {
        safety: () => <SafetyCenterScreen spots={async () => fullSpots} openUrl={openUrl} />,
      },
      '/safety',
    );
    await screen.findByText('Union lobby');
    expect(screen.getByTestId('safety-spot-a').props.accessibilityState).toEqual({
      selected: false,
    });
    fireEvent.press(screen.getByTestId('spot-marker-a', HIDDEN));
    expect(screen.getByTestId('safety-spot-a').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByTestId('spot-pin-a-public-selected', HIDDEN)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Directions to Union lobby'));
    expect(openUrl).toHaveBeenCalled();
  });
});
