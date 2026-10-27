import { createQueryClient, isOnline, shouldRetry } from '../src/lib/queryClient';

describe('lib/queryClient retry policy', () => {
  it('retries offline and unknown errors at most twice', () => {
    expect(shouldRetry(0, new TypeError('Network request failed'))).toBe(true);
    expect(shouldRetry(1, new Error('weird'))).toBe(true);
    expect(shouldRetry(2, new TypeError('Network request failed'))).toBe(false);
  });

  it('never retries business errors or expired sessions', () => {
    expect(shouldRetry(0, { code: 'P0001', message: 'FORBIDDEN' })).toBe(false);
    expect(shouldRetry(0, { status: 401, message: 'Unauthorized' })).toBe(false);
  });

  it('does not retry mutations', () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });
});

describe('lib/queryClient online status', () => {
  it('counts only a definite "not connected" as offline', () => {
    expect(isOnline({ isConnected: false })).toBe(false);
    expect(isOnline({ isConnected: true })).toBe(true);
  });

  it('treats an unknown connection as online so queries never pause on it', () => {
    expect(isOnline({ isConnected: null })).toBe(true);
  });
});
