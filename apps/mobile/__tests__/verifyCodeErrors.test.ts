import { createAuthApi } from '@/features/auth/api';
import { toAppError } from '@/lib/errors';

function apiWithOtpError(error: unknown) {
  const verifyOtp = jest.fn().mockResolvedValue({ data: null, error });
  const deps = {
    auth: () => ({ verifyOtp }),
    rpc: jest.fn(),
  } as never;
  return createAuthApi(deps);
}

async function codeFor(error: unknown): Promise<string> {
  try {
    await apiWithOtpError(error).verifyCode('ben@owu.edu', '123456');
  } catch (e) {
    return toAppError(e).code;
  }
  throw new Error('expected verifyCode to throw');
}

describe('T-UNIT-AUTH verifyCode error codes', () => {
  it('reports a wrong or expired code as INVALID so the screen counts a try', async () => {
    expect(await codeFor({ status: 403, message: 'Token has expired or is invalid' })).toBe(
      'INVALID',
    );
  });

  it('does not count a server outage as a wrong code', async () => {
    expect(await codeFor({ status: 500, message: 'internal' })).not.toBe('INVALID');
  });

  it('keeps offline separate from a wrong code', async () => {
    expect(await codeFor(new TypeError('Network request failed'))).toBe('ERR_OFFLINE');
  });

  it('keeps rate limiting separate from a wrong code', async () => {
    expect(await codeFor({ status: 429, message: 'too many' })).toBe('RATE_LIMITED');
  });
});
