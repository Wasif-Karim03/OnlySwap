import { type as typeTokens, type TypeVariant } from '@onlyswap/tokens';
import { render, screen } from '@testing-library/react-native';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { StyleSheet } from 'react-native';

import { Text } from '../src/components/Text';

const VARIANTS = Object.keys(typeTokens) as TypeVariant[];

describe('P2-FONT-01 Text renders every type row', () => {
  it.each(VARIANTS)('%s uses its token size, weight and line height', (variant) => {
    render(
      <Text variant={variant} testID="t">
        Aa
      </Text>,
    );
    const el = screen.getByTestId('t');
    const style = StyleSheet.flatten(el.props.style);
    const t = typeTokens[variant];
    expect(style.fontSize).toBe(t.fontSize);
    expect(style.fontWeight).toBe(t.fontWeight);
    expect(style.lineHeight).toBe(t.lineHeight);
    expect(el.props.allowFontScaling).toBe(true);
    expect(el.props.maxFontSizeMultiplier).toBeUndefined();
    expect(style.fontFamily).toBeUndefined();
  });

  it('uses tabular numerals for prices', () => {
    render(
      <Text variant="price" testID="p">
        $40
      </Text>,
    );
    expect(StyleSheet.flatten(screen.getByTestId('p').props.style).fontVariant).toEqual([
      'tabular-nums',
    ]);
  });

  it('caps Dynamic Type at 1.4x only for overlays', () => {
    render(
      <Text overlay testID="o">
        On a photo
      </Text>,
    );
    expect(screen.getByTestId('o').props.maxFontSizeMultiplier).toBe(1.4);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('T-UNIT-TOK-01 accent is never text or icon color (UX-03)', () => {
  it('no source file sets color to the accent', () => {
    const root = join(__dirname, '..');
    const offenders = [...sourceFiles(join(root, 'src')), ...sourceFiles(join(root, 'app'))].filter(
      (f) =>
        /\bcolor:\s*theme\.colors\.accent\b|tintColor:\s*theme\.colors\.accent\b/.test(
          readFileSync(f, 'utf8'),
        ),
    );
    expect(offenders).toEqual([]);
  });

  it('Text has no accent tone', () => {
    const src = readFileSync(join(__dirname, '../src/components/Text.tsx'), 'utf8');
    const toneLine = src.match(/export type TextTone = ([^;]+);/)?.[1] ?? '';
    expect(toneLine).not.toMatch(/'accent'/);
  });
});
