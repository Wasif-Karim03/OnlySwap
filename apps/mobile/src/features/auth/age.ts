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

type Range =
  | {
      lowerBound?: number | null;
      upperBound?: number | null;
      ageRangeDeclaration?: string | null;
    }
  | null
  | undefined;

/** How the OS range was declared (profiles.age_declaration). Never a birthday. */
export type AgeDeclaration = 'self_declared' | 'guardian_declared' | 'confirmed';

/** Apple's regulatory features (iOS 26.4+). */
export type RegulatoryFeature =
  | 'declaredAgeRangeRequired'
  | 'significantAppChangeRequiresAdultNotification'
  | 'significantAppChangeRequiresParentalConsent';

/** What we need from expo-age-range (injected so tests run without native code). */
export type AgeRangeModule = {
  requestAgeRangeAsync: (options: { threshold1: number; threshold2?: number }) => Promise<Range>;
  requestAgeSignalsAccessAsync: () => Promise<string | null>;
  /** iOS 26.2+: true when Apple says age assurance law applies to this person. */
  isEligibleForAgeFeaturesAsync?: () => Promise<boolean | null>;
  /** iOS 26.4+: which regulatory features apply; null means unknown. */
  getRequiredRegulatoryFeaturesAsync?: () => Promise<string[] | null>;
  /** iOS 26.4+: Apple's sheet that tells the adult about a significant update. */
  showSignificantUpdateAcknowledgmentAsync?: (updateDescription: string) => Promise<void>;
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

/** iOS declaration names to the server's. Anything else (Android, old iOS) is null. */
export function toDeclaration(value: string | null | undefined): AgeDeclaration | null {
  if (value === 'selfDeclared') return 'self_declared';
  if (value === 'guardianDeclared') return 'guardian_declared';
  if (value === 'confirmed') return 'confirmed';
  return null;
}

export type AgeAnswer = { signal: AgeSignal; declaration: AgeDeclaration | null };

const UNKNOWN_ANSWER: AgeAnswer = { signal: 'unknown', declaration: null };

async function withTimeout<T>(work: Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });
  try {
    return await Promise.race([work.catch(() => fallback), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Asks the OS once, with how the range was declared. Unsupported, declined,
 * not shared (Android), an error or no answer within the timeout all mean
 * "unknown".
 */
export async function requestAgeAnswer(
  mod: AgeRangeModule | null,
  device: Device,
  timeoutMs: number = AGE_SIGNAL_TIMEOUT_MS,
): Promise<AgeAnswer> {
  if (!mod || !supportsAgeSignal(device)) return UNKNOWN_ANSWER;
  const ask = (async (): Promise<AgeAnswer> => {
    if (device.os === 'android') {
      // Play Age Signals reports every field as null unless the user shared it.
      const access = await mod.requestAgeSignalsAccessAsync();
      if (access !== 'SHARED') return UNKNOWN_ANSWER;
    }
    const range = await mod.requestAgeRangeAsync({ threshold1: MIN_AGE, threshold2: ADULT_AGE });
    const signal = classifyRange(range);
    return {
      signal,
      declaration: signal === 'unknown' ? null : toDeclaration(range?.ageRangeDeclaration),
    };
  })();
  return withTimeout(ask, UNKNOWN_ANSWER, timeoutMs);
}

/** The signal alone (the date field shows when it is "unknown"). */
export async function requestAgeSignal(
  mod: AgeRangeModule | null,
  device: Device,
  timeoutMs: number = AGE_SIGNAL_TIMEOUT_MS,
): Promise<AgeSignal> {
  return (await requestAgeAnswer(mod, device, timeoutMs)).signal;
}

/**
 * Apple age assurance (AR-03; Texas, Utah, Louisiana). `required` means the
 * age must come from Declared Age Range, with no birthday fallback. Only iOS
 * answers; anything unknown (old iOS, an error, a timeout) is not required,
 * because those phones can't give an OS answer anyway.
 */
export type Regulation = { required: boolean; features: RegulatoryFeature[] };

export const NOT_REGULATED: Regulation = { required: false, features: [] };

const FEATURES: readonly RegulatoryFeature[] = [
  'declaredAgeRangeRequired',
  'significantAppChangeRequiresAdultNotification',
  'significantAppChangeRequiresParentalConsent',
];

export async function checkRegulation(
  mod: AgeRangeModule | null,
  device: Device,
  timeoutMs: number = AGE_SIGNAL_TIMEOUT_MS,
): Promise<Regulation> {
  if (!mod || device.os !== 'ios' || !supportsAgeSignal(device)) return NOT_REGULATED;
  const ask = (async (): Promise<Regulation> => {
    const [eligible, raw] = await Promise.all([
      mod.isEligibleForAgeFeaturesAsync?.().catch(() => null) ?? null,
      mod.getRequiredRegulatoryFeaturesAsync?.().catch(() => null) ?? null,
    ]);
    const features = (raw ?? []).filter((f): f is RegulatoryFeature =>
      (FEATURES as readonly string[]).includes(f),
    );
    return {
      required: eligible === true || features.includes('declaredAgeRangeRequired'),
      features,
    };
  })();
  return withTimeout(ask, NOT_REGULATED, timeoutMs);
}

/**
 * Before shipping a significant update to a regulated person (Texas law).
 * Adults see Apple's acknowledgment sheet. Teens whose parent must approve
 * get 'needs_parental_consent': expo-age-range has no PermissionKit request,
 * so the caller holds the change back for that person (AR-03 gap, RELEASE).
 */
export async function acknowledgeSignificantUpdate(
  mod: AgeRangeModule | null,
  regulation: Regulation,
  updateDescription: string,
): Promise<'shown' | 'not_needed' | 'needs_parental_consent'> {
  if (regulation.features.includes('significantAppChangeRequiresParentalConsent')) {
    return 'needs_parental_consent';
  }
  if (
    !regulation.features.includes('significantAppChangeRequiresAdultNotification') ||
    !mod?.showSignificantUpdateAcknowledgmentAsync
  ) {
    return 'not_needed';
  }
  await mod.showSignificantUpdateAcknowledgmentAsync(updateDescription);
  return 'shown';
}

/** YYYY-MM-DD from the picker's local date (no time zone shift). */
export function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
