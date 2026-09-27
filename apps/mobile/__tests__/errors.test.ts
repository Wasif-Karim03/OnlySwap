import {
  ERROR_CODES,
  errorCopy,
  isAppError,
  parseServerMessage,
  toAppError,
} from '../src/lib/errors';
import { errors as errorStrings } from '../src/strings/en';

describe('T-UNIT-LIB-01 lib/errors.toAppError', () => {
  it('parses P0001 RATE_LIMITED with a retryAt', () => {
    const e = toAppError({ code: 'P0001', message: 'RATE_LIMITED:offer:2026-09-26T22:00:00Z' });
    expect(e.code).toBe('RATE_LIMITED');
    expect(e.action).toBe('offer');
    expect(e.retryAt?.toISOString()).toBe('2026-09-26T22:00:00.000Z');
  });

  it('parses P0001 RATE_LIMITED without a retryAt', () => {
    const e = toAppError({ code: 'P0001', message: 'RATE_LIMITED:offer' });
    expect(e).toMatchObject({ code: 'RATE_LIMITED', action: 'offer' });
    expect(e.retryAt).toBeUndefined();
  });

  it('keeps the detail of parameterized codes', () => {
    expect(toAppError({ code: 'P0001', message: 'NOT_ACTIVE:suspended' })).toMatchObject({
      code: 'NOT_ACTIVE',
      detail: 'suspended',
    });
    expect(toAppError({ code: 'P0001', message: 'INVALID:price_cents' }).detail).toBe(
      'price_cents',
    );
  });

  it('maps network failures to ERR_OFFLINE', () => {
    expect(toAppError(new TypeError('Network request failed')).code).toBe('ERR_OFFLINE');
    expect(toAppError({ message: 'Failed to fetch' }).code).toBe('ERR_OFFLINE');
  });

  it('maps 401 and expired JWTs to SESSION_EXPIRED', () => {
    expect(toAppError({ status: 401, message: 'Unauthorized' }).code).toBe('SESSION_EXPIRED');
    expect(toAppError({ code: 'PGRST301', message: 'JWT expired' }).code).toBe('SESSION_EXPIRED');
  });

  it('maps anything else to UNKNOWN without throwing', () => {
    expect(toAppError({ code: 'P0001', message: 'SOMETHING_NEW' }).code).toBe('UNKNOWN');
    expect(toAppError(undefined).code).toBe('UNKNOWN');
    expect(toAppError(42).code).toBe('UNKNOWN');
    expect(toAppError('boom').code).toBe('UNKNOWN');
  });

  it('passes AppErrors through and recognizes them', () => {
    const e = toAppError({ code: 'P0001', message: 'FORBIDDEN' });
    expect(isAppError(e)).toBe(true);
    expect(toAppError(e)).toBe(e);
  });

  it('ignores unknown heads in parseServerMessage', () => {
    expect(parseServerMessage('hello:world')).toBeUndefined();
  });
});

describe('T-UNIT-LIB-02 lib/errors.errorCopy', () => {
  const opts = { campusTimeZone: 'America/New_York' };

  it('has copy for every ErrorCode', () => {
    const copy = Object.fromEntries(
      ERROR_CODES.map((code) => [code, errorCopy({ kind: 'app_error', code }, opts)]),
    );
    for (const code of ERROR_CODES) expect(copy[code]).toEqual(expect.any(String));
    expect(copy).toMatchSnapshot();
  });

  it('formats RATE_LIMITED time in the campus time zone', () => {
    const retryAt = new Date('2026-09-26T22:00:00Z');
    expect(errorCopy({ kind: 'app_error', code: 'RATE_LIMITED', retryAt }, opts)).toBe(
      errorStrings.RATE_LIMITED_UNTIL.replace('{time}', '6:00 PM'),
    );
    expect(
      errorCopy(
        { kind: 'app_error', code: 'RATE_LIMITED', retryAt },
        { campusTimeZone: 'America/Los_Angeles' },
      ),
    ).toContain('3:00 PM');
  });
});
