/**
 * T-UNIT-CRASH-01 (F-08, DEC 103): a render crash anywhere under the root
 * layout shows the crash screen instead of a blank one, reports the error
 * once (the Sentry opt-out still applies in beforeSend), and Try again
 * re-renders the routes.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text } from 'react-native';

import { CrashScreen } from '@/components/CrashScreen';
import { captureError } from '@/lib/sentry';
import { crash } from '@/strings/en';

jest.mock('@/lib/sentry', () => ({ captureError: jest.fn() }));

describe('T-UNIT-CRASH-01 crash screen', () => {
  beforeEach(() => jest.mocked(captureError).mockClear());

  it('shows plain copy and a retry button', () => {
    render(<CrashScreen error={new Error('boom')} retry={jest.fn()} />);
    expect(screen.getByText(crash.title)).toBeTruthy();
    expect(screen.getByText(crash.body)).toBeTruthy();
    expect(screen.getByRole('button', { name: crash.retry })).toBeTruthy();
    expect(screen.queryByText('boom')).toBeNull();
  });

  it('reports the error once, even across re-renders', () => {
    const error = new Error('boom');
    const { rerender } = render(<CrashScreen error={error} retry={jest.fn()} />);
    rerender(<CrashScreen error={error} retry={jest.fn()} />);
    expect(captureError).toHaveBeenCalledTimes(1);
    expect(captureError).toHaveBeenCalledWith(error);
  });

  it('Try again calls retry', async () => {
    const retry = jest.fn().mockResolvedValue(undefined);
    render(<CrashScreen error={new Error('boom')} retry={retry} />);
    fireEvent.press(screen.getByRole('button', { name: crash.retry }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('the root layout exports the boundary (Expo Router picks it up by name)', () => {
    const src = readFileSync(join(__dirname, '../app/_layout.tsx'), 'utf8');
    expect(src).toMatch(/export function ErrorBoundary\(/);
  });

  it('in a real router tree, a screen that throws shows it, and Try again recovers', async () => {
    let broken = true;
    const Boom = () => {
      if (broken) throw new Error('render crash');
      return <Text>back again</Text>;
    };
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    renderRouter({
      _layout: {
        default: () => <Stack screenOptions={{ headerShown: false }} />,
        ErrorBoundary: CrashScreen,
      },
      index: Boom,
    });
    expect(await screen.findByTestId('crash-screen')).toBeTruthy();
    expect(captureError).toHaveBeenCalledWith(expect.objectContaining({ message: 'render crash' }));
    broken = false;
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: crash.retry }));
    });
    expect(await screen.findByText('back again')).toBeTruthy();
    quiet.mockRestore();
  });

  it('copy follows the voice rules', () => {
    for (const s of Object.values(crash)) {
      expect(s).not.toMatch(/\u2014|!|[\u{1F300}-\u{1FAFF}]/u);
    }
  });
});
