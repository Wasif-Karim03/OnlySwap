import { fontScale } from '@onlyswap/tokens';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Dimensions, View } from 'react-native';

import WelcomeRoute from '../app/(auth)/welcome';
import { laneTiles } from '../src/features/auth/WelcomeScreen';
import { welcome } from '../src/strings/en';

// The email step is its own screen (signInScreens.test); a stub keeps this test about Welcome.
function EmailRoute() {
  return <View testID="screen-email" />;
}
const routes = { '(auth)/welcome': WelcomeRoute, '(auth)/email': EmailRoute };

function setFontScale(fontScale: number) {
  const base = { width: 375, height: 667, scale: 2 };
  act(() => Dimensions.set({ window: { ...base, fontScale }, screen: { ...base, fontScale } }));
}

// React Native's Jest default fontScale is 2; reset after each size-specific test.
afterEach(() => setFontScale(2));

describe('P4-AUTH-04 S-A02 Welcome (board A2)', () => {
  it('has one headline, the pitch and two actions', async () => {
    renderRouter(routes, { initialUrl: '/welcome' });
    expect(await screen.findByRole('header', { name: welcome.title })).toBeTruthy();
    expect(screen.getByText(welcome.body)).toBeTruthy();
    expect(screen.getByRole('button', { name: welcome.continue })).toBeTruthy();
    expect(screen.getByRole('button', { name: welcome.signIn })).toBeTruthy();
  });

  it('Continue opens the school email step', async () => {
    const router = renderRouter(routes, { initialUrl: '/welcome' });
    fireEvent.press(await screen.findByTestId('welcome-continue'));
    expect(await screen.findByTestId('screen-email')).toBeTruthy();
    expect(router.getPathname()).toBe('/email');
  });

  it('"I already have an account" opens it in sign-in mode', async () => {
    const router = renderRouter(routes, { initialUrl: '/welcome' });
    fireEvent.press(await screen.findByTestId('welcome-sign-in'));
    await screen.findByTestId('screen-email');
    expect(router.getSearchParams()).toEqual({ mode: 'login' });
  });

  // QA recheck (SE ax-large): the uncapped display headline broke mid-word
  // ("Everythin / g") over the photo wall. It is a photo overlay: capped at 1.4x.
  it('caps the headline over the photo wall at the overlay Dynamic Type limit', async () => {
    renderRouter(routes, { initialUrl: '/welcome' });
    const headline = await screen.findByRole('header', { name: welcome.title });
    expect(headline.props.maxFontSizeMultiplier).toBe(fontScale.overlayMax);
  });

  // QA recheck (SE ax-large): the copy grew past the bottom fade and sat on the photos.
  it('puts the copy on a solid accent field at large text, not on the photos', async () => {
    setFontScale(2);
    renderRouter(routes, { initialUrl: '/welcome' });
    expect(await screen.findByTestId('welcome-copy-field')).toBeTruthy();
  });

  it('keeps the default layout (no copy field) at the default text size', async () => {
    setFontScale(1);
    renderRouter(routes, { initialUrl: '/welcome' });
    await screen.findByTestId('screen-welcome');
    expect(screen.queryByTestId('welcome-copy-field')).toBeNull();
  });

  it('the listing wall is decoration, hidden from screen readers', async () => {
    renderRouter(routes, { initialUrl: '/welcome' });
    await screen.findByTestId('screen-welcome');
    const note = welcome.wall.notes[4];
    expect(screen.queryAllByText(note)).toHaveLength(0);
    expect(screen.getAllByText(note, { includeHiddenElements: true }).length).toBeGreaterThan(0);
  });

  it('each wall column loops two copies of mixed photos and notes', () => {
    const tiles = laneTiles(0, 120);
    expect(tiles).toHaveLength(6);
    expect(tiles.some((t) => t.kind === 'note')).toBe(true);
    for (const t of tiles) {
      expect(t.height).toBeGreaterThan(0);
      if (t.kind === 'photo') expect(welcome.wall.prices).toContain(t.price);
    }
    // Every photo has a price (same order as welcomeAssets).
    expect(welcome.wall.prices).toHaveLength(8);
  });
});
