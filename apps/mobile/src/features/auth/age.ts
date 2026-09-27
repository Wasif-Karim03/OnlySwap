/**
 * The OS age signal (A05, P4-AUTH-07; T-UNIT-AUTH-04). iOS 26 Declared Age
 * Range and Play Age Signals answer "18 or older?" without a birthday; when
 * they can't, the screen falls back to the date field. The answer is never
 * sent to analytics.
 */

export type AgeSignal = 'adult' | 'minor' | 'unknown';

export const AGE_SIGNAL_TIMEOUT_MS = 4_000;
/** Declared Age Range exists from iOS 26; before that expo-age-range answers "18+" for everyone. */
export const IOS_MIN_AGE_RANGE = 26;

type Range = { lowerBound?: number | null; upperBound?: number | null } | null | undefined;

/** What we need from expo-age-range (injected so tests run without native code). */
export type AgeRangeModule = {
  requestAgeRangeAsync: (options: { threshold1: number }) => Promise<Range>;
  requestAgeSignalsAccessAsync: () => Promise<string | null>;
};

export type Device = { os: 'ios' | 'android' | 'other'; version: string | number };

export function classifyRange(range: Range): AgeSignal {
  if (!range) return 'unknown';
  if (typeof range.lowerBound === 'number' && range.lowerBound >= 18) return 'adult';
  if (typeof range.upperBound === 'number' && range.upperBound < 18) return 'minor';
  return 'unknown';
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
    return classifyRange(await mod.requestAgeRangeAsync({ threshold1: 18 }));
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
