/**
 * The OS age signal (A05, P4-AUTH-07; T-UNIT-AUTH-04). iOS 26 Declared Age
 * Range and Play Age Signals answer "13 or older?" and "18 or older?" without
 * a birthday; when they can't, the screen falls back to the date field. The
 * answer is never sent to analytics. The minimum age is 13 (DEC 136).
 */

export const MIN_AGE = 13;
export const ADULT_AGE = 18;

/** The age group the server records (profiles.age_band). */
export type AgeBand = '13_17' | '18_plus';

export type AgeSignal = 'adult' | 'teen' | 'under_minimum' | 'unknown';

export const AGE_SIGNAL_TIMEOUT_MS = 4_000;
/** Declared Age Range exists from iOS 26; before that expo-age-range answers "18+" for everyone. */
export const IOS_MIN_AGE_RANGE = 26;

type Range = { lowerBound?: number | null; upperBound?: number | null } | null | undefined;

/** What we need from expo-age-range (injected so tests run without native code). */
export type AgeRangeModule = {
  requestAgeRangeAsync: (options: { threshold1: number; threshold2?: number }) => Promise<Range>;
  requestAgeSignalsAccessAsync: () => Promise<string | null>;
};

export type Device = { os: 'ios' | 'android' | 'other'; version: string | number };

export function classifyRange(range: Range): AgeSignal {
  if (!range) return 'unknown';
  if (typeof range.lowerBound === 'number' && range.lowerBound >= ADULT_AGE) return 'adult';
  if (typeof range.lowerBound === 'number' && range.lowerBound >= MIN_AGE) return 'teen';
  if (typeof range.upperBound === 'number' && range.upperBound < MIN_AGE) return 'under_minimum';
  // e.g. "under 18" with no lower bound may still be under 13.
  return 'unknown';
}

/** The band confirm_age_v2 takes for an OS answer. */
export function bandForSignal(s: Exclude<AgeSignal, 'unknown'>): AgeBand | 'under_13' {
  if (s === 'adult') return '18_plus';
  if (s === 'teen') return '13_17';
  return 'under_13';
}

/** Whether this OS gives a real answer (older iOS returns a fake "18+"). */
export function supportsAgeSignal(device: Device): boolean {
  if (device.os === 'android') return true;
  if (device.os !== 'ios') return false;
  const major = Number.parseInt(String(device.version), 10);
  return Number.isFinite(major) && major >= IOS_MIN_AGE_RANGE;
}

/**
 * Asks the OS once. Unsupported, declined, not shared (Android), an error or
 * no answer within the timeout all mean "unknown" so the date field shows.
 */
export async function requestAgeSignal(
  mod: AgeRangeModule | null,
  device: Device,
  timeoutMs: number = AGE_SIGNAL_TIMEOUT_MS,
): Promise<AgeSignal> {
  if (!mod || !supportsAgeSignal(device)) return 'unknown';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<AgeSignal>((resolve) => {
    timer = setTimeout(() => resolve('unknown'), timeoutMs);
  });
  const ask = (async (): Promise<AgeSignal> => {
    if (device.os === 'android') {
      // Play Age Signals reports every field as null unless the user shared it.
      const access = await mod.requestAgeSignalsAccessAsync();
      if (access !== 'SHARED') return 'unknown';
    }
    return classifyRange(
      await mod.requestAgeRangeAsync({ threshold1: MIN_AGE, threshold2: ADULT_AGE }),
    );
  })().catch((): AgeSignal => 'unknown');
  try {
    return await Promise.race([ask, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** YYYY-MM-DD from the picker's local date (no time zone shift). */
export function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
