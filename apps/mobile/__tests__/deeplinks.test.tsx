import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { LinkErrorScreen, UpdateScreen } from '../src/features/system/SystemScreens';
import { rewriteDeepLink } from '../src/lib/deeplinks';
import { system } from '../src/strings/en';

const ID = '00000000-0000-4000-8000-000000000001';

describe('P11-STATE-02 deep links', () => {
  it.each([
    [`https://onlyswap.pages.dev/l/${ID}`, `/listing/${ID}`],
    [`/l/${ID}`, `/listing/${ID}`],
    [`/l/${ID}/`, `/listing/${ID}`],
    ['/l/not-an-id', '/link-error'],
    ['https://onlyswap.pages.dev/m/abc123', '/inbox'],
    [`onlyswap://listing/${ID}`, `/listing/${ID}`],
    ['/chat/c1', '/chat/c1'],
    ['', '/'],
  ])('%s → %s', (input, out) => {
    expect(rewriteDeepLink(input)).toBe(out);
  });
});

describe('P11-STATE-01 system screens', () => {
  it('update opens the download page', () => {
    const openUrl = jest.fn(async () => {});
    renderRouter(
      { index: () => <UpdateScreen openUrl={openUrl} site={() => 'https://s/'} /> },
      { initialUrl: '/' },
    );
    fireEvent.press(screen.getByText(system.updateButton));
    expect(openUrl).toHaveBeenCalledWith('https://s/download');
  });

  it('a bad link offers Discover', async () => {
    renderRouter(
      {
        'link-error': () => <LinkErrorScreen />,
        discover: () => <Text testID="screen-discover">d</Text>,
      },
      { initialUrl: '/link-error' },
    );
    fireEvent.press(screen.getByText(system.goHome));
    expect(await screen.findByTestId('screen-discover')).toBeTruthy();
  });
});
