import {
  compareVersions,
  computeGate,
  emailDomain,
  GATE_HREF,
  normalizeEmail,
  parseAppConfig,
  validateName,
  type AppConfig,
  type GateInput,
  type GateProfile,
} from '../src/features/auth/logic';

describe('T-UNIT-AUTH-01 auth/logic.validateName', () => {
  it.each(['Zoë', 'José', "O'Neil", 'Mary-Kate', 'Anne Marie', 'Ren’ee', '美咲', 'Åsa', 'Nguyễn'])(
    'accepts %s',
    (name) => expect(validateName(name)).toBe('ok'),
  );
  it.each(['R2D2', 'Ann3', '-Ann', "Ann'", 'A_n', 'ann@', 'x!'])('rejects %s', (name) =>
    expect(validateName(name)).toBe('invalid'),
  );
  it('requires a name and trims spaces', () => {
    expect(validateName('   ')).toBe('empty');
    expect(validateName('  Ana  ')).toBe('ok');
  });
  it('allows 30 characters, not 31', () => {
    expect(validateName('a'.repeat(30))).toBe('ok');
    expect(validateName('a'.repeat(31))).toBe('too_long');
  });
  it('counts characters, not UTF-16 units', () => {
    expect(validateName('美'.repeat(30))).toBe('ok');
  });
});

describe('email helpers', () => {
  it('normalizes case and spaces', () => {
    expect(normalizeEmail('  Aisha@OSU.edu ')).toBe('aisha@osu.edu');
    expect(emailDomain(' Aisha@Buckeyemail.OSU.edu')).toBe('buckeyemail.osu.edu');
  });
  it.each(['aisha', 'aisha@', '@osu.edu', 'a@b', 'a b@osu.edu', 'a@@osu.edu'])(
    'rejects %s',
    (input) => expect(normalizeEmail(input)).toBeNull(),
  );
});

describe('compareVersions', () => {
  it.each([
    ['1.0.0', '1.0.0', 0],
    ['1.0.9', '1.0.10', -1],
    ['1.2', '1.1.9', 1],
    ['2.0.0', '10.0.0', -1],
    ['1.0', '1.0.0', 0],
  ])('%s vs %s', (a, b, want) => expect(compareVersions(a, b)).toBe(want));
});

const config: AppConfig = {
  maintenance: { enabled: false, until: null },
  minVersionIos: '1.0.0',
  minVersionAndroid: '1.0.0',
  rulesVersion: '2',
};
const ready: GateProfile = {
  status: 'active',
  firstName: 'Aisha',
  adultConfirmed: true,
  rulesVersion: '2',
};
const base: GateInput = {
  config,
  appVersion: '1.0.0',
  platform: 'ios',
  session: 'signedIn',
  profile: ready,
  notificationsAsked: true,
};
const gate = (over: Partial<GateInput> = {}, profile: Partial<GateProfile> = {}) =>
  computeGate({ ...base, profile: { ...ready, ...profile }, ...over });

describe('T-UNIT-AUTH-03 auth/useAppGate routing (computeGate)', () => {
  it('waits while the session or config is loading', () => {
    expect(gate({ session: 'loading' })).toBeNull();
    expect(gate({ config: undefined })).toBeNull();
    expect(gate({ profile: undefined })).toBeNull();
  });

  it('maintenance beats everything, even signed out', () => {
    const on = { ...config, maintenance: { enabled: true, until: null } };
    expect(gate({ config: on })).toBe('maintenance');
    expect(gate({ config: on, session: 'signedOut' })).toBe('maintenance');
  });

  it('update required per platform', () => {
    const cfg = { ...config, minVersionIos: '1.2.0', minVersionAndroid: '1.0.0' };
    expect(gate({ config: cfg })).toBe('update');
    expect(gate({ config: cfg, platform: 'android' })).toBe('home');
    expect(gate({ config: cfg, appVersion: '1.10.0' })).toBe('home');
  });

  it('skips config checks when the config could not load', () => {
    expect(gate({ config: null })).toBe('home');
    expect(gate({ config: null }, { rulesVersion: '1' })).toBe('home');
  });

  it('signed out goes to Welcome; a session without a profile too', () => {
    expect(gate({ session: 'signedOut', profile: undefined })).toBe('welcome');
    expect(computeGate({ ...base, profile: null })).toBe('welcome');
  });

  it.each(['banned', 'suspended', 'paused'] as const)('%s goes to account status', (status) => {
    expect(gate({}, { status, adultConfirmed: false, firstName: null })).toBe('account-status');
  });

  it('reverify comes before onboarding', () => {
    expect(gate({}, { status: 'reverify', adultConfirmed: false })).toBe('reverify');
  });

  it('onboarding order: age, profile, rules', () => {
    expect(gate({}, { adultConfirmed: false, firstName: null, rulesVersion: null })).toBe('age');
    expect(gate({}, { firstName: null, rulesVersion: null })).toBe('profile-setup');
    expect(gate({}, { rulesVersion: null })).toBe('rules');
  });

  it('waitlist after onboarding, then the notifications ask, then home', () => {
    expect(gate({}, { status: 'waitlist' })).toBe('waitlist');
    expect(gate({ notificationsAsked: false })).toBe('notifications');
    expect(gate()).toBe('home');
  });

  it('every route has an href', () => {
    for (const href of Object.values(GATE_HREF)) expect(href.startsWith('/')).toBe(true);
  });
});

describe('T-UNIT-AUTH-06 gate routes to Updated rules when rules_version changes', () => {
  it('an accepted older version shows the updated-rules screen', () => {
    expect(gate({}, { rulesVersion: '1' })).toBe('rules-updated');
    expect(GATE_HREF['rules-updated']).toBe('/rules?updated=1');
  });
  it('the current version passes', () => {
    expect(gate({}, { rulesVersion: '2' })).toBe('home');
  });
});

describe('parseAppConfig', () => {
  it('reads get_app_config output', () => {
    expect(
      parseAppConfig({
        maintenance: { enabled: true, until: '2026-10-01T00:00:00Z' },
        min_version_ios: '1.1.0',
        min_version_android: '1.0.2',
        rules_version: '3',
        quad_enabled: false,
      }),
    ).toEqual({
      maintenance: { enabled: true, until: '2026-10-01T00:00:00Z' },
      minVersionIos: '1.1.0',
      minVersionAndroid: '1.0.2',
      rulesVersion: '3',
    });
  });
  it('falls back safely on junk', () => {
    expect(parseAppConfig(null)).toEqual({
      maintenance: { enabled: false, until: null },
      minVersionIos: '0',
      minVersionAndroid: '0',
      rulesVersion: '',
    });
    expect(parseAppConfig({ maintenance: 'yes' }).maintenance.enabled).toBe(false);
  });
});
