import { act, render, renderHook, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccessibilityInfo } from 'react-native';

import { Button } from '../src/components/Button';
import { useReducedMotion } from '../src/theme/reducedMotion';

describe('P2-MOT-01 reduce motion follows the OS setting live', () => {
  it('updates when the user flips Reduce Motion while the app is open', async () => {
    let emit: (v: boolean) => void = () => {};
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      _: string,
      cb: (v: boolean) => void,
    ) => {
      emit = cb;
      return { remove: jest.fn() };
    }) as never);
    const { result } = renderHook(() => useReducedMotion());
    await act(async () => {});
    expect(result.current).toBe(false);
    act(() => emit(true));
    expect(result.current).toBe(true);
  });
});

describe('P2-FONT-01 large Dynamic Type', () => {
  it('button labels wrap instead of truncating', () => {
    render(<Button label="Show code error" />);
    expect(screen.getByText('Show code error').props.numberOfLines).toBeUndefined();
  });

  it('text re-mounts on a live font scale change (no clipped line boxes)', () => {
    const src = readFileSync(join(__dirname, '../src/components/Text.tsx'), 'utf8');
    expect(src).toMatch(/useWindowDimensions\(\)/);
    expect(src).toMatch(/key=\{fontScale\}/);
  });
});

describe('P2-CMP-04 sheet gesture runs on the UI thread', () => {
  it('the close rule is a worklet', () => {
    const src = readFileSync(join(__dirname, '../src/components/Sheet.tsx'), 'utf8');
    const fn = src.slice(src.indexOf('export function shouldCloseSheet'));
    expect(fn.slice(0, 200)).toContain("'worklet'");
  });
});
