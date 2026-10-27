import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  acknowledgeSignificantUpdate,
  bandForSignal,
  checkRegulation,
  classifyRange,
  NOT_REGULATED,
  requestAgeAnswer,
  requestAgeSignal,
  toDeclaration,
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
  it('adult, teen, under_minimum, unknown', async () => {
    await expect(requestAgeSignal(mod({ lowerBound: 18, upperBound: null }), ios26)).resolves.toBe(
      'adult',
    );
    await expect(requestAgeSignal(mod({ lowerBound: 13, upperBound: 17 }), ios26)).resolves.toBe(
      'teen',
    );
    await expect(requestAgeSignal(mod({ lowerBound: 0, upperBound: 12 }), ios26)).resolves.toBe(
      'under_minimum',
    );
    await expect(
      requestAgeSignal(mod({ lowerBound: null, upperBound: null }), ios26),
    ).resolves.toBe('unknown');
  });

  it('asks the OS the 13 and 18 questions', async () => {
    const m = mod({ lowerBound: 13, upperBound: 17 });
    await expect(requestAgeSignal(m, ios26)).resolves.toBe('teen');
    expect(m.requestAgeRangeAsync).toHaveBeenCalledWith({ threshold1: 13, threshold2: 18 });
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
    expect(classifyRange({ lowerBound: null, upperBound: null })).toBe('unknown');
    expect(classifyRange({ lowerBound: 21 })).toBe('adult');
    expect(classifyRange({ lowerBound: 18 })).toBe('adult');
    expect(classifyRange({ lowerBound: 13, upperBound: 17 })).toBe('teen');
    expect(classifyRange({ lowerBound: 16, upperBound: 17 })).toBe('teen');
    expect(classifyRange({ upperBound: 12 })).toBe('under_minimum');
    expect(classifyRange({ lowerBound: 0, upperBound: 12 })).toBe('under_minimum');
    // "Under 18" with no lower bound may still be under 13.
    expect(classifyRange({ upperBound: 17 })).toBe('unknown');
  });
  it('bandForSignal', () => {
    expect(bandForSignal('adult')).toBe('18_plus');
    expect(bandForSignal('teen')).toBe('13_17');
    expect(bandForSignal('under_minimum')).toBe('under_13');
  });
  it('toIsoDate keeps the local date', () => {
    expect(toIsoDate(new Date(2008, 8, 26, 23, 30))).toBe('2008-09-26');
    expect(toIsoDate(new Date(2000, 0, 5))).toBe('2000-01-05');
  });
});

describe('T-UNIT-AGE-ASSURE AR-03 auth/age regulation and declaration', () => {
  const ios264 = { os: 'ios' as const, version: '26.4' };
  const reg = (eligible: unknown, features: unknown) =>
    ({
      ...mod(null),
      isEligibleForAgeFeaturesAsync: jest.fn(async () => {
        if (eligible instanceof Error) throw eligible;
        return eligible as boolean | null;
      }),
      getRequiredRegulatoryFeaturesAsync: jest.fn(async () => {
        if (features instanceof Error) throw features;
        return features as string[] | null;
      }),
    }) satisfies AgeRangeModule;

  it('maps iOS declarations and nothing else', () => {
    expect(toDeclaration('selfDeclared')).toBe('self_declared');
    expect(toDeclaration('guardianDeclared')).toBe('guardian_declared');
    expect(toDeclaration('confirmed')).toBe('confirmed');
    expect(toDeclaration('TIER_A')).toBeNull();
    expect(toDeclaration(null)).toBeNull();
    expect(toDeclaration(undefined)).toBeNull();
  });

  it('requestAgeAnswer returns the declaration with a known signal only', async () => {
    await expect(
      requestAgeAnswer(
        mod({ lowerBound: 13, upperBound: 17, ageRangeDeclaration: 'guardianDeclared' }),
        ios26,
      ),
    ).resolves.toEqual({ signal: 'teen', declaration: 'guardian_declared' });
    await expect(
      requestAgeAnswer(mod({ upperBound: 17, ageRangeDeclaration: 'selfDeclared' }), ios26),
    ).resolves.toEqual({ signal: 'unknown', declaration: null });
    await expect(requestAgeAnswer(mod(new Error('declined')), ios26)).resolves.toEqual({
      signal: 'unknown',
      declaration: null,
    });
  });

  it('required when Apple says eligible', async () => {
    await expect(checkRegulation(reg(true, null), ios264)).resolves.toEqual({
      required: true,
      features: [],
    });
  });

  it('required when the features list declaredAgeRangeRequired; unknown names are dropped', async () => {
    await expect(
      checkRegulation(
        reg(null, [
          'declaredAgeRangeRequired',
          'somethingNew',
          'significantAppChangeRequiresParentalConsent',
        ]),
        ios264,
      ),
    ).resolves.toEqual({
      required: true,
      features: ['declaredAgeRangeRequired', 'significantAppChangeRequiresParentalConsent'],
    });
  });

  it('not required when Apple says no, or errors, or the methods are missing', async () => {
    await expect(checkRegulation(reg(false, []), ios264)).resolves.toEqual(NOT_REGULATED);
    await expect(checkRegulation(reg(new Error('x'), new Error('y')), ios264)).resolves.toEqual(
      NOT_REGULATED,
    );
    await expect(checkRegulation(mod(null), ios264)).resolves.toEqual(NOT_REGULATED);
  });

  it('only iOS 26+ is asked', async () => {
    const m = reg(true, ['declaredAgeRangeRequired']);
    await expect(checkRegulation(m, { os: 'ios', version: '18.5' })).resolves.toEqual(
      NOT_REGULATED,
    );
    await expect(checkRegulation(m, { os: 'android', version: 35 })).resolves.toEqual(
      NOT_REGULATED,
    );
    await expect(checkRegulation(null, ios264)).resolves.toEqual(NOT_REGULATED);
    expect(m.isEligibleForAgeFeaturesAsync).not.toHaveBeenCalled();
  });

  it('a hung answer times out as not required', async () => {
    jest.useFakeTimers();
    try {
      const m = {
        ...mod(null),
        isEligibleForAgeFeaturesAsync: () => new Promise<boolean>(() => {}),
      };
      const p = checkRegulation(m, ios264, 50);
      jest.advanceTimersByTime(60);
      await expect(p).resolves.toEqual(NOT_REGULATED);
    } finally {
      jest.useRealTimers();
    }
  });

  it('significant update: adults see Apple sheet, teens needing consent are held, others skip', async () => {
    const show = jest.fn(async () => {});
    const m = { ...mod(null), showSignificantUpdateAcknowledgmentAsync: show };
    await expect(
      acknowledgeSignificantUpdate(
        m,
        { required: true, features: ['significantAppChangeRequiresAdultNotification'] },
        'Chat photos',
      ),
    ).resolves.toBe('shown');
    expect(show).toHaveBeenCalledWith('Chat photos');
    await expect(
      acknowledgeSignificantUpdate(
        m,
        {
          required: true,
          features: [
            'significantAppChangeRequiresParentalConsent',
            'significantAppChangeRequiresAdultNotification',
          ],
        },
        'x',
      ),
    ).resolves.toBe('needs_parental_consent');
    await expect(acknowledgeSignificantUpdate(m, NOT_REGULATED, 'x')).resolves.toBe('not_needed');
    await expect(
      acknowledgeSignificantUpdate(
        mod(null),
        { required: true, features: ['significantAppChangeRequiresAdultNotification'] },
        'x',
      ),
    ).resolves.toBe('not_needed');
    expect(show).toHaveBeenCalledTimes(1);
  });
});
