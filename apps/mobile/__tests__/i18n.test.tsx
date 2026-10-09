import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { DevSettings, Text } from 'react-native';

import { LanguageScreen, SettingsScreen } from '../src/features/me/SettingsScreens';
import { formatDate, formatTime, money } from '../src/lib/format';
import * as enModule from '../src/strings/en';
import { en, settings } from '../src/strings/en';
import { es } from '../src/strings/es';
import * as active from '../src/strings';
import {
  getLanguagePref,
  INTL_TAGS,
  localeFromTag,
  reloadApp,
  resolveLocale,
  setLanguage,
} from '../src/strings';
import { getStorage } from '../src/lib/storage';

const mockReloadAsync = jest.fn<Promise<void>, []>();
jest.mock('expo-updates', () => ({ reloadAsync: () => mockReloadAsync() }));

/** Every leaf as [path, value]; array items are indexed so lengths must match too. */
function leaves(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  }
  return [];
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const enLeaves = new Map(leaves(en));
const esLeaves = new Map(leaves(es));

/* eslint-disable @typescript-eslint/no-require-imports -- fresh module registries need require() */

/**
 * Loads `src/strings` (and anything `load` requires) as a fresh app start
 * would: its own module registry, the given saved choice and device language.
 */
function freshStart<T>(opts: { pref?: 'system' | 'en' | 'es'; device?: string }, load: () => T): T {
  const worker = process.env.JEST_WORKER_ID;
  const spy = opts.device
    ? jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(
        () =>
          ({
            resolvedOptions: () => ({ locale: opts.device }),
          }) as unknown as Intl.DateTimeFormat,
      )
    : null;
  let result!: T;
  try {
    jest.isolateModules(() => {
      const { getStorage: isolatedStorage } =
        require('../src/lib/storage') as typeof import('../src/lib/storage');
      if (opts.pref) isolatedStorage().set('settings.language', opts.pref);
      else isolatedStorage().remove('settings.language');
      // strings/index.ts pins English under Jest; look like a real app start instead.
      delete process.env.JEST_WORKER_ID;
      try {
        // Loading only: Intl stays mocked just while the locale is resolved.
        result = load();
      } finally {
        process.env.JEST_WORKER_ID = worker;
      }
    });
  } finally {
    spy?.mockRestore();
  }
  return result;
}

describe('T-UNIT-I18N-01 es.ts mirrors en.ts (P17-FEAT-03)', () => {
  it('has exactly the same key paths, array lengths included', () => {
    expect([...esLeaves.keys()].sort()).toEqual([...enLeaves.keys()].sort());
    expect(esLeaves.size).toBeGreaterThan(1000);
  });

  it.each([...enLeaves.keys()])('%s keeps the same placeholders', (path) => {
    expect(placeholders(esLeaves.get(path) ?? '')).toEqual(placeholders(enLeaves.get(path)!));
  });

  it('never ships an empty string', () => {
    for (const [path, text] of esLeaves) {
      if ((enLeaves.get(path) ?? '').trim())
        expect(`${path}: ${text.trim()}`).not.toBe(`${path}: `);
    }
  });

  it('translates Meetup spot and Police-designated the same way every time', () => {
    for (const [path, text] of enLeaves) {
      const t = esLeaves.get(path)!;
      if (text.includes('Meetup spot')) expect(`${path}: ${t}`).toMatch(/Puntos? de encuentro/);
      if (text.includes('Police-designated')) {
        expect(`${path}: ${t}`).toMatch(/designados? por la policía/i);
      }
      expect(t).not.toMatch(/Meetup spot|Police-designated/);
    }
  });

  it('keeps the brand and the non-copy values', () => {
    expect(es.rules.items.map((r) => r.icon)).toEqual(en.rules.items.map((r) => r.icon));
    expect(es.feed.metaSeparator).toBe(en.feed.metaSeparator);
    expect(es.sell.shareMessage).toContain('OnlySwap');
    expect(es.safety.deleteType).toContain('DELETE');
  });
});

describe('T-UNIT-I18N-02 locale resolution (P17-FEAT-03)', () => {
  it.each([
    ['es', 'es'],
    ['es-MX', 'es'],
    ['es_US', 'es'],
    ['ES-419', 'es'],
    ['en-US', 'en'],
    ['fr-FR', 'en'],
    ['estonian', 'en'],
    ['', 'en'],
    [undefined, 'en'],
  ])('device %p reads as %p', (tag, want) => {
    expect(localeFromTag(tag)).toBe(want);
  });

  it('a saved choice beats the device, system or junk follows the device', () => {
    expect(resolveLocale('es', 'en-US')).toBe('es');
    expect(resolveLocale('en', 'es-MX')).toBe('en');
    expect(resolveLocale('system', 'es-MX')).toBe('es');
    expect(resolveLocale('system', 'en-US')).toBe('en');
    expect(resolveLocale(undefined, 'es-MX')).toBe('es');
    expect(resolveLocale('de', 'en-US')).toBe('en');
    expect(resolveLocale(undefined, 'xx-unknown')).toBe('en');
  });

  it('Jest always runs in English and re-exports every section of en.ts', () => {
    expect(active.locale).toBe('en');
    expect(active.intlLocale).toBe('en-US');
    expect(active.strings).toBe(en);
    const sections = Object.keys(en);
    const activeExports: Record<string, unknown> = { ...active };
    for (const k of sections) {
      expect(activeExports[k]).toBe(en[k as keyof typeof en]);
    }
    const enExports = Object.keys(enModule).filter((k) => k !== 'en' && k !== 'default');
    expect(enExports.sort()).toEqual(sections.sort());
  });

  it('a saved Spanish choice is used at startup', () => {
    const result = freshStart({ pref: 'es', device: 'en-US' }, () => {
      return require('../src/strings') as typeof import('../src/strings');
    });
    expect(result.locale).toBe('es');
    expect(result.intlLocale).toBe(INTL_TAGS.es);
    expect(result.tabs.discover).toBe(es.tabs.discover);
    expect(result.settings.languageRestartBody).toBe(es.settings.languageRestartBody);
  });

  it('with no saved choice a Spanish phone (es-MX) gets Spanish', () => {
    const result = freshStart({ device: 'es-MX' }, () => {
      return require('../src/strings') as typeof import('../src/strings');
    });
    expect(result.locale).toBe('es');
  });

  it('an English (en-US) or unknown phone gets English, and so does a saved English choice', () => {
    const load = () => {
      return (require('../src/strings') as typeof import('../src/strings')).locale;
    };
    expect([
      freshStart({ device: 'en-US' }, load),
      freshStart({ device: 'zz' }, load),
      freshStart({ pref: 'en', device: 'es-MX' }, load),
      freshStart({ pref: 'system', device: 'en-GB' }, load),
    ]).toEqual(['en', 'en', 'en', 'en']);
  });
});

describe('T-UNIT-I18N-03 setLanguage saves and restarts (P17-FEAT-03)', () => {
  afterEach(() => getStorage().remove('settings.language'));

  it('stores the choice, then reloads', async () => {
    const order: string[] = [];
    const reload = jest.fn(() => {
      order.push(`reload:${getLanguagePref()}`);
    });
    await setLanguage('es', { reload });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['reload:es']);
    expect(getStorage().get('settings.language')).toBe('es');
  });

  it('getLanguagePref is system when nothing or junk is saved', () => {
    expect(getLanguagePref()).toBe('system');
    getStorage().set('settings.language', 'fr' as never);
    expect(getLanguagePref()).toBe('system');
  });

  it('reloadApp uses expo-updates, and DevSettings when updates cannot reload', async () => {
    // Touching DevSettings under Jest logs a NativeEventEmitter warning; it is noise here.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const devSpy = jest.spyOn(DevSettings, 'reload').mockImplementation(() => {});
    mockReloadAsync.mockResolvedValueOnce(undefined);
    await reloadApp();
    expect(mockReloadAsync).toHaveBeenCalledTimes(1);
    expect(devSpy).not.toHaveBeenCalled();

    mockReloadAsync.mockRejectedValueOnce(new Error('not available in dev'));
    await reloadApp();
    expect(mockReloadAsync).toHaveBeenCalledTimes(2);
    expect(devSpy).toHaveBeenCalledTimes(1);
    devSpy.mockRestore();
    warn.mockRestore();
  });
});

describe('T-UNIT-I18N-04 formatting follows the locale (P17-FEAT-03)', () => {
  const at = new Date(Date.UTC(2026, 2, 5, 21, 30));

  it('money stays US dollars in both languages', () => {
    expect(money(123400)).toBe('$1,234');
    expect(money(1250)).toBe('$12.50');
    expect(money(123400, 'es-US')).toBe('$1,234');
    expect(money(1250, 'es-US')).toBe('$12.50');
  });

  it('times and dates use Spanish conventions in es', () => {
    expect(formatTime(at, 'UTC')).toMatch(/^9:30\sPM$/);
    expect(formatTime(at, 'UTC', 'es-US')).toMatch(/^9:30\sp\.\s?m\.$/);
    expect(formatDate(at, { month: 'short', day: 'numeric', timeZone: 'UTC' }, 'es-US')).toBe(
      '5 mar',
    );
  });

  it('relative times, prices and day labels come from the Spanish strings in an es run', () => {
    const result = freshStart({ pref: 'es' }, () => {
      const feed =
        require('../src/features/feed/logic') as typeof import('../src/features/feed/logic');
      const meet =
        require('../src/features/meetups/logic') as typeof import('../src/features/meetups/logic');
      const campus =
        require('../src/features/campus/logic') as typeof import('../src/features/campus/logic');
      const now = new Date(2026, 2, 5, 12, 0);
      return {
        minutes: feed.agoLabel(new Date(2026, 2, 5, 11, 55), now),
        yesterday: feed.agoLabel(new Date(2026, 2, 4, 9, 0), now),
        days: feed.agoLabel(new Date(2026, 2, 1, 9, 0), now),
        when: meet.whenLabel(new Date(2026, 2, 6, 16, 30).toISOString(), now),
        countdown: meet.countdown(new Date(2026, 2, 5, 12, 25).toISOString(), now),
        budget: campus.budgetLabel(4000),
      };
    });
    expect(result.minutes).toBe('hace 5 minutos');
    expect(result.yesterday).toBe('ayer');
    expect(result.days).toMatch(/^hace \d+ días$/);
    expect(result.when).toMatch(/^Mañana 4:30\sp\.\s?m\.$/);
    expect(result.countdown).toBe('Empieza en 25 min');
    expect(result.budget).toBe('Hasta $40');
  });
});

/* eslint-enable @typescript-eslint/no-require-imports */

function Stub({ id }: { id: string }) {
  return <Text testID={id}>{id}</Text>;
}

describe('T-UNIT-I18N-05 Language setting (P17-FEAT-03)', () => {
  it('Settings has a Language row that opens the Language screen', async () => {
    renderRouter(
      {
        settings: () => <SettingsScreen />,
        'settings/language': () => <Stub id="screen-language-stub" />,
      },
      { initialUrl: '/settings' },
    );
    expect(
      await screen.findByRole('button', {
        name: `${settings.language}, ${settings.languages.system}`,
      }),
    ).toBeTruthy();
    fireEvent.press(screen.getByText(settings.language));
    expect(await screen.findByTestId('screen-language-stub')).toBeTruthy();
  });

  it('switching to Español asks to restart, then applies it', async () => {
    const apply = jest.fn(async () => {});
    const save = jest.fn(async () => {});
    renderRouter(
      {
        'settings/language': () => (
          <LanguageScreen current="system" deviceTag="en-US" apply={apply} save={save} />
        ),
      },
      { initialUrl: '/settings/language' },
    );
    for (const pref of ['system', 'en', 'es'] as const) {
      expect(await screen.findByLabelText(settings.languages[pref])).toBeTruthy();
    }
    fireEvent.press(screen.getByLabelText(settings.languages.es));
    expect(await screen.findByText(settings.languageRestartBody)).toBeTruthy();
    expect(apply).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText(settings.languageRestartConfirm));
    await waitFor(() => expect(apply).toHaveBeenCalledWith('es'));
    expect(save).not.toHaveBeenCalled();
  });

  it('cancel keeps the current language', async () => {
    const apply = jest.fn(async () => {});
    renderRouter(
      {
        'settings/language': () => (
          <LanguageScreen current="system" deviceTag="en-US" apply={apply} />
        ),
      },
      { initialUrl: '/settings/language' },
    );
    fireEvent.press(await screen.findByLabelText(settings.languages.es));
    expect(await screen.findByText(settings.languageRestartBody)).toBeTruthy();
    fireEvent.press(screen.getByText(en.sheet.cancel));
    expect(apply).not.toHaveBeenCalled();
    expect(screen.getByLabelText(settings.languages.system).props.accessibilityState).toMatchObject(
      { checked: true },
    );
    expect(screen.getByLabelText(settings.languages.es).props.accessibilityState).toMatchObject({
      checked: false,
    });
  });

  it('a choice that keeps the same language saves without a restart', async () => {
    const apply = jest.fn(async () => {});
    const save = jest.fn(async () => {});
    renderRouter(
      {
        'settings/language': () => (
          <LanguageScreen current="system" deviceTag="en-US" apply={apply} save={save} />
        ),
      },
      { initialUrl: '/settings/language' },
    );
    fireEvent.press(await screen.findByLabelText(settings.languages.en));
    await waitFor(() => expect(save).toHaveBeenCalledWith('en'));
    expect(apply).not.toHaveBeenCalled();
    expect(screen.queryByText(settings.languageRestartBody)).toBeNull();
  });
});
