import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  classifyRange,
  requestAgeSignal,
  supportsAgeSignal,
  toIsoDate,
  type AgeRangeModule,
} from '../src/features/auth/age';

const ios26 = { os: 'ios' as const, version: '26.1' };

function mod(
  result: unknown,
  access: string | null = 'SHARED',
): AgeRangeModule & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    requestAgeRangeAsync: jest.fn(async () => {
      calls.push('range');
      if (result instanceof Error) throw result;
      return result as never;
    }),
    requestAgeSignalsAccessAsync: jest.fn(async () => {
      calls.push('access');
      return access;
    }),
  };
}

describe('T-UNIT-AUTH-04 auth/age.requestAgeSignal', () => {
  it('adult, minor, unknown', async () => {
    await expect(requestAgeSignal(mod({ lowerBound: 18, upperBound: null }), ios26)).resolves.toBe(
      'adult',
    );
    await expect(requestAgeSignal(mod({ lowerBound: 13, upperBound: 17 }), ios26)).resolves.toBe(
      'minor',
    );
    await expect(
      requestAgeSignal(mod({ lowerBound: null, upperBound: null }), ios26),
    ).resolves.toBe('unknown');
  });

  it('an error or a declined prompt is unknown', async () => {
    await expect(requestAgeSignal(mod(new Error('declined')), ios26)).resolves.toBe('unknown');
  });

  it('a timeout is unknown', async () => {
    const hang: AgeRangeModule = {
      requestAgeRangeAsync: () => new Promise(() => {}),
      requestAgeSignalsAccessAsync: async () => 'SHARED',
    };
    await expect(requestAgeSignal(hang, ios26, 20)).resolves.toBe('unknown');
  });

  it('iOS before 26 is never trusted (the module fakes 18+ there)', async () => {
    const m = mod({ lowerBound: 18 });
    await expect(requestAgeSignal(m, { os: 'ios', version: '18.5' })).resolves.toBe('unknown');
    expect(m.calls).toEqual([]);
    expect(supportsAgeSignal({ os: 'ios', version: '26.0' })).toBe(true);
    expect(supportsAgeSignal({ os: 'other', version: 1 })).toBe(false);
  });

  it('Android asks for access first and ignores the range unless it was shared', async () => {
    const shared = mod({ lowerBound: 18 }, 'SHARED');
    await expect(requestAgeSignal(shared, { os: 'android', version: 34 })).resolves.toBe('adult');
    expect(shared.calls).toEqual(['access', 'range']);
    const denied = mod({ lowerBound: 18 }, 'DECLINED');
    await expect(requestAgeSignal(denied, { os: 'android', version: 34 })).resolves.toBe('unknown');
    expect(denied.calls).toEqual(['access']);
  });

  it('no module is unknown', async () => {
    await expect(requestAgeSignal(null, ios26)).resolves.toBe('unknown');
  });

  it('never calls analytics: the module is the only thing it touches', () => {
    // The function takes the age module and the device only; nothing else is imported.
    const raw = readFileSync(join(__dirname, '../src/features/auth/age.ts'), 'utf8');
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/import /);
    expect(src).not.toMatch(/track|posthog|analytics\./i);
  });
});

describe('age helpers', () => {
  it('classifyRange', () => {
    expect(classifyRange(null)).toBe('unknown');
    expect(classifyRange({ lowerBound: 21 })).toBe('adult');
    expect(classifyRange({ upperBound: 12 })).toBe('minor');
  });
  it('toIsoDate keeps the local date', () => {
    expect(toIsoDate(new Date(2008, 8, 26, 23, 30))).toBe('2008-09-26');
    expect(toIsoDate(new Date(2000, 0, 5))).toBe('2000-01-05');
  });
});
