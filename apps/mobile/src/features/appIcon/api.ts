/**
 * expo-alternate-app-icons behind a small seam so screens and tests don't
 * load the native module directly. Missing module (old dev client) reads as
 * "not supported" and the picker hides itself.
 */
export type AppIconApi = {
  supported: () => boolean;
  current: () => string | null;
  set: (nativeName: string | null) => Promise<unknown>;
};

type Native = typeof import('expo-alternate-app-icons');

function load(): Native | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native module
    return require('expo-alternate-app-icons') as Native;
  } catch {
    return null;
  }
}

export const appIconApi: AppIconApi = {
  supported: () => {
    try {
      return load()?.supportsAlternateIcons === true;
    } catch {
      return false;
    }
  },
  current: () => {
    try {
      return load()?.getAppIconName() ?? null;
    } catch {
      return null;
    }
  },
  set: async (nativeName) => {
    const m = load();
    if (!m) throw new Error('alternate icons unavailable');
    return m.setAlternateAppIcon(nativeName);
  },
};
