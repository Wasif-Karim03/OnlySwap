import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Button, buttonLabelTone, type ButtonVariant } from '../src/components/Button';
import { Toggle } from '../src/components/Toggle';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const { lightTheme } = jest.requireActual('../src/theme/themes');

type Style = { backgroundColor?: string; opacity?: number; color?: string };

/** The nearest ancestor of `node` (inclusive) whose style sets a background. */
function fillOf(label: string): Style {
  let node = screen.getByText(label).parent;
  while (node && !StyleSheet.flatten(node.props.style)?.backgroundColor) node = node.parent;
  return (StyleSheet.flatten(node?.props.style) ?? {}) as Style;
}

describe('QA-M15 disabled buttons stay legible', () => {
  const filled: ButtonVariant[] = ['primary', 'accent', 'dark', 'secondary', 'destructive'];

  it.each(filled)('a disabled %s button is a neutral bg3 fill at full opacity', (variant) => {
    render(<Button label="Delete" variant={variant} disabled />);
    const fill = fillOf('Delete');
    expect(fill.backgroundColor).toBe(lightTheme.colors.bg3);
    expect(fill.opacity).toBe(1);
    const label = StyleSheet.flatten(screen.getByText('Delete').props.style) as Style;
    expect(label.color).toBe(lightTheme.colors.ink2);
  });

  it('an enabled destructive button keeps its red fill and inverse label', () => {
    render(<Button label="Delete" variant="destructive" />);
    expect(fillOf('Delete').backgroundColor).toBe(lightTheme.colors.red);
    expect(buttonLabelTone('destructive', false)).toBe('inverse');
  });

  it('buttons on the accent screen keep the 35% dim and their own label', () => {
    expect(buttonLabelTone('onAccent', true)).toBe('onPhoto');
    expect(buttonLabelTone('textOnAccent', true)).toBe('onAccent');
    render(<Button label="Continue" variant="onAccent" disabled />);
    expect(fillOf('Continue').opacity).toBe(0.35);
  });
});

describe('QA-M9 notification toggles', () => {
  const trackOf = () =>
    screen
      .getByRole('switch')
      .findAll((n) => StyleSheet.flatten(n.props.style)?.borderWidth === 2)[0];

  it('an off switch has a visible ink3 outline', () => {
    render(<Toggle label="Tips" value={false} onChange={() => {}} />);
    expect(StyleSheet.flatten(trackOf()?.props.style)?.borderColor).toBe(lightTheme.colors.ink3);
  });

  it('an on switch outlines in ink', () => {
    render(<Toggle label="Tips" value onChange={() => {}} />);
    expect(StyleSheet.flatten(trackOf()?.props.style)?.borderColor).toBe(lightTheme.colors.ink);
  });

  it('rows with a caption get vertical padding', () => {
    render(
      <Toggle
        label="Tips"
        description="Off unless you turn it on."
        value={false}
        onChange={() => {}}
      />,
    );
    const row = screen.getByRole('switch');
    const style = StyleSheet.flatten(
      typeof row.props.style === 'function' ? row.props.style({ pressed: false }) : row.props.style,
    );
    expect(style?.paddingVertical).toBe(lightTheme.space.md);
  });
});
