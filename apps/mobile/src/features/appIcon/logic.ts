/**
 * Alternate app icons (R2-ICON-01, board F14 Appearance: Default, Night,
 * Paper, Mono). Made from the OnlySwap mark only, no school names or marks
 * (assets/images/app-icons/generate.py).
 */
export const APP_ICONS = ['default', 'night', 'paper', 'mono'] as const;
export type AppIconChoice = (typeof APP_ICONS)[number];

/**
 * Native icon names (expo-alternate-app-icons: PascalCase; on Android the
 * launcher alias is MainActivity + name). Keep in step with the plugin entry
 * in app.config.ts (ALT_APP_ICONS), which the appConfig test checks.
 */
export const NATIVE_ICON_NAMES: Record<Exclude<AppIconChoice, 'default'>, string> = {
  night: 'Night',
  paper: 'Paper',
  mono: 'Mono',
};

export function nativeIconName(choice: AppIconChoice): string | null {
  return choice === 'default' ? null : NATIVE_ICON_NAMES[choice];
}

/** The picker choice for what the OS reports; unknown names fall back to Default. */
export function choiceFromNative(name: string | null | undefined): AppIconChoice {
  const hit = (Object.keys(NATIVE_ICON_NAMES) as Exclude<AppIconChoice, 'default'>[]).find(
    (k) => NATIVE_ICON_NAMES[k] === name,
  );
  return hit ?? 'default';
}

export function isAppIconChoice(v: unknown): v is AppIconChoice {
  return typeof v === 'string' && (APP_ICONS as readonly string[]).includes(v);
}
