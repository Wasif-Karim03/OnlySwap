import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { View } from 'react-native';

import WelcomeRoute from '../app/(auth)/welcome';
import { laneTiles } from '../src/features/auth/WelcomeScreen';
import { welcome } from '../src/strings/en';

// The email step is its own screen (signInScreens.test); a stub keeps this test about Welcome.
function EmailRoute() {
  return <View testID="screen-email" />;
}
const routes = { '(auth)/welcome': WelcomeRoute, '(auth)/email': EmailRoute };

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
