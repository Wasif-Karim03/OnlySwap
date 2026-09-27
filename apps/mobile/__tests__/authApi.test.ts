import { createAuthApi, type AuthClient, type ProfileQuery } from '../src/features/auth/api';

function setup(opts: { rpcData?: unknown; rpcError?: unknown; authError?: unknown } = {}) {
  const rpc = jest.fn(async () => ({ data: opts.rpcData ?? null, error: opts.rpcError ?? null }));
  const session = { access_token: 't', user: { id: 'u1' } };
  const auth = {
    signInWithOtp: jest.fn(async () => ({ error: opts.authError ?? null })),
    verifyOtp: jest.fn(async () => ({
      data: { session: opts.authError ? null : session },
      error: opts.authError ?? null,
    })),
    signInWithPassword: jest.fn(async () => ({
      data: { session: opts.authError ? null : session },
      error: opts.authError ?? null,
    })),
    signOut: jest.fn(async () => ({ error: null })),
  };
  const profile = jest.fn(async () => ({
    data: {
      status: 'active' as const,
      first_name: 'Aisha',
      adult_confirmed_at: '2026-09-01T00:00:00Z',
      rules_version: '1',
    },
    error: null,
  }));
  const api = createAuthApi({
    auth: () => auth as unknown as AuthClient,
    rpc: () => ({ rpc, auth: { refreshSession: async () => ({ error: null }) } }),
    profile: profile as unknown as ProfileQuery,
  });
  return { api, rpc, auth, profile };
}

describe('T-UNIT-AUTH-02 auth/api.lookupSchool', () => {
  it('personal domains short-circuit without a server call', async () => {
    const { api, rpc } = setup();
    await expect(api.lookupSchool('me@Gmail.com')).resolves.toEqual({ kind: 'personal' });
    await expect(api.lookupSchool('me@icloud.com ')).resolves.toEqual({ kind: 'personal' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('malformed input never reaches the server', async () => {
    const { api, rpc } = setup();
    await expect(api.lookupSchool('aisha@')).resolves.toEqual({ kind: 'invalid' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends the lowercased, trimmed domain', async () => {
    const { api, rpc } = setup({
      rpcData: {
        campus_id: 'c1',
        name: 'The Ohio State University',
        short_name: 'Ohio State',
        status: 'live',
        is_review: false,
      },
    });
    await expect(api.lookupSchool('  Aisha@OSU.EDU ')).resolves.toEqual({
      kind: 'school',
      school: {
        campusId: 'c1',
        name: 'The Ohio State University',
        shortName: 'Ohio State',
        status: 'live',
        isReview: false,
      },
    });
    expect(rpc).toHaveBeenCalledWith('lookup_school', { domain: 'osu.edu' });
  });

  it('null from the server means unknown school', async () => {
    const { api } = setup({ rpcData: null });
    await expect(api.lookupSchool('a@nowhere.edu')).resolves.toEqual({ kind: 'unknown' });
  });
});

describe('auth/api codes and sessions', () => {
  it('sendCode normalizes the email and creates the account if needed', async () => {
    const { api, auth } = setup();
    await api.sendCode(' Aisha@OSU.edu ', { inviteCode: ' ABCD2345 ' });
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'aisha@osu.edu',
      options: { shouldCreateUser: true, data: { invite_code: 'ABCD2345' } },
    });
  });

  it('sendCode surfaces the Auth hook code as an AppError', async () => {
    const { api } = setup({ authError: { status: 403, message: 'SCHOOL_UNKNOWN' } });
    await expect(api.sendCode('x@gmail.com')).rejects.toMatchObject({
      kind: 'app_error',
      code: 'SCHOOL_UNKNOWN',
    });
  });

  it('sendCode refuses a malformed email before calling Auth', async () => {
    const { api, auth } = setup();
    await expect(api.sendCode('nope')).rejects.toMatchObject({ code: 'INVALID', detail: 'email' });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('verifyCode strips non-digits and returns the session', async () => {
    const { api, auth } = setup();
    await expect(api.verifyCode('a@osu.edu', '123 456')).resolves.toMatchObject({
      user: { id: 'u1' },
    });
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: 'a@osu.edu',
      token: '123456',
      type: 'email',
    });
  });

  it('verifyCode maps Auth errors', async () => {
    const { api } = setup({
      authError: { status: 403, message: 'Token has expired or is invalid' },
    });
    await expect(api.verifyCode('a@osu.edu', '000000')).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('signInReviewer uses a password', async () => {
    const { api, auth } = setup();
    await api.signInReviewer('appreview@review.onlyswap.test', 'pw');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'appreview@review.onlyswap.test',
      password: 'pw',
    });
  });

  it('signOut defaults to this device; global signs out everywhere', async () => {
    const { api, auth } = setup();
    await api.signOut();
    await api.signOut('global');
    expect(auth.signOut).toHaveBeenNthCalledWith(1, { scope: 'local' });
    expect(auth.signOut).toHaveBeenNthCalledWith(2, { scope: 'global' });
  });

  it('getGateProfile maps the row', async () => {
    const { api, profile } = setup();
    await expect(api.getGateProfile('u1')).resolves.toEqual({
      status: 'active',
      firstName: 'Aisha',
      adultConfirmed: true,
      rulesVersion: '1',
      verifiedUntil: null,
    });
    expect(profile).toHaveBeenCalledWith('u1');
  });

  it('getAppConfig parses get_app_config', async () => {
    const { api, rpc } = setup({ rpcData: { rules_version: '4', min_version_ios: '1.0.1' } });
    await expect(api.getAppConfig()).resolves.toMatchObject({
      rulesVersion: '4',
      minVersionIos: '1.0.1',
    });
    expect(rpc).toHaveBeenCalledWith('get_app_config', undefined);
  });
});
