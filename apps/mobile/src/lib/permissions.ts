import {
  getCameraPermissionsAsync,
  getMediaLibraryPermissionsAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
} from 'expo-image-picker';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

/** R1.0 has no location permission (DEC-2, CLAUDE.md rule 11). */
export type PermissionKind = 'camera' | 'photos' | 'notifications';

/** The parts of an expo permission response the primer needs. */
export type OsPermission = {
  status: 'granted' | 'denied' | 'undetermined';
  canAskAgain: boolean;
  /** iOS photos: "limited" still lets people pick photos. */
  accessPrivileges?: 'all' | 'limited' | 'none';
};

/**
 * What to show (P2-CMP-10, T-UNIT-CMP-*):
 * - `granted`: go ahead, no primer
 * - `primer`: our explainer first, and the OS prompt only from its button
 * - `settings`: the OS won't ask again, so explain and link to Settings
 */
export type PrimerStep = 'granted' | 'primer' | 'settings';

export function primerStep(permission: OsPermission): PrimerStep {
  if (permission.status === 'granted') return 'granted';
  if (permission.accessPrivileges === 'limited') return 'granted';
  if (permission.status === 'undetermined') return 'primer';
  // Denied: Android can ask again after one "Don't allow"; iOS never can.
  return permission.canAskAgain ? 'primer' : 'settings';
}

export type OsApi = {
  get: () => Promise<OsPermission>;
  request: () => Promise<OsPermission>;
};

export const osPermissions: Record<PermissionKind, OsApi> = {
  camera: { get: getCameraPermissionsAsync, request: requestCameraPermissionsAsync },
  photos: {
    get: () => getMediaLibraryPermissionsAsync(false),
    request: () => requestMediaLibraryPermissionsAsync(false),
  },
  notifications: { get: getPermissionsAsync, request: requestPermissionsAsync },
};

export type PermissionPrimerState = {
  /** `null` until the first check finishes. */
  step: PrimerStep | null;
  /** True while the OS prompt is up. */
  requesting: boolean;
  /** Shows the OS prompt. Resolves true when access was granted. */
  request: () => Promise<boolean>;
  openSettings: () => Promise<void>;
  refresh: () => Promise<void>;
};

/**
 * Tracks one permission and re-checks when the app comes back from Settings.
 * Never prompts on its own: only `request()` shows the OS dialog.
 */
export function usePermissionPrimer(
  kind: PermissionKind,
  api: OsApi = osPermissions[kind],
): PermissionPrimerState {
  const [step, setStep] = useState<PrimerStep | null>(null);
  const [requesting, setRequesting] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const result = await api.get();
    if (alive.current) setStep(primerStep(result));
  }, [api]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => {
      alive.current = false;
      sub.remove();
    };
  }, [refresh]);

  const request = useCallback(async () => {
    setRequesting(true);
    try {
      const result = await api.request();
      const next = primerStep(result);
      if (alive.current) setStep(next);
      return next === 'granted';
    } finally {
      if (alive.current) setRequesting(false);
    }
  }, [api]);

  const openSettings = useCallback(() => Linking.openSettings(), []);

  return { step, requesting, request, openSettings, refresh };
}
