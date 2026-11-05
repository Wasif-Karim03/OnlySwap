import { isSignedOutPath } from '@/features/auth/signedOutPaths';

describe('T-UNIT-AUTH signedOutPaths isSignedOutPath', () => {
  it('allows the sign-in steps and system screens', () => {
    for (const path of ['/', '/welcome', '/email', '/verify', '/age', '/maintenance', '/update']) {
      expect(isSignedOutPath(path)).toBe(true);
    }
  });

  it('allows legal and help pages, including nested ones', () => {
    expect(isSignedOutPath('/legal/terms')).toBe(true);
    expect(isSignedOutPath('/help')).toBe(true);
  });

  it('blocks protected screens reached by a deep link while signed out', () => {
    for (const path of ['/chat/abc', '/offer/abc', '/meetup/abc', '/settings/delete', '/inbox']) {
      expect(isSignedOutPath(path)).toBe(false);
    }
  });

  it('does not treat a prefix lookalike as a public page', () => {
    expect(isSignedOutPath('/helpdesk')).toBe(false);
    expect(isSignedOutPath('/legalese')).toBe(false);
  });
});
