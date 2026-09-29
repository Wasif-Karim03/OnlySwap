import type { ExpoConfig } from 'expo/config';

import buildConfig, { BLOCKED_ANDROID_PERMISSIONS, BUNDLE_ID, WEB_HOST } from '../app.config';
import { permissions } from '../src/strings/en';

type PluginEntry = string | [string, Record<string, unknown>];

function load(env: Record<string, string | undefined> = {}): ExpoConfig {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    return buildConfig({
      config: {},
      projectRoot: __dirname,
      staticConfigPath: null,
      packageJsonPath: null,
    } as never);
  } finally {
    process.env = saved;
  }
}

function pluginOptions(cfg: ExpoConfig, name: string): Record<string, unknown> | undefined {
  const entry = (cfg.plugins as PluginEntry[] | undefined)?.find((p) =>
    Array.isArray(p) ? p[0] === name : p === name,
  );
  return Array.isArray(entry) ? entry[1] : undefined;
}

describe('T-STORE (TESTING §7) app.config.ts matches the locked native config (P1-SETUP-04)', () => {
  const cfg = load();

  it('uses the locked identity', () => {
    expect(cfg.name).toBe('OnlySwap');
    expect(cfg.scheme).toBe('onlyswap');
    expect(BUNDLE_ID).toBe('app.onlyswap');
    expect(cfg.ios?.bundleIdentifier).toBe('app.onlyswap');
    expect(cfg.android?.package).toBe('app.onlyswap');
  });

  it('is portrait, phone only, with no export-regulated encryption', () => {
    expect(cfg.orientation).toBe('portrait');
    expect(cfg.ios?.supportsTablet).toBe(false);
    expect(cfg.ios?.config?.usesNonExemptEncryption).toBe(false);
    expect(cfg.ios?.deploymentTarget).toBe('16.4');
  });

  it('declares exactly the three iOS capabilities', () => {
    expect(cfg.ios?.associatedDomains).toEqual([`applinks:${WEB_HOST}`]);
    expect(cfg.ios?.entitlements).toEqual({
      'com.apple.developer.usernotifications.time-sensitive': true,
      'com.apple.developer.declared-age-range': true,
    });
  });

  it('has a privacy manifest with the required-reason APIs and no tracking', () => {
    const pm = cfg.ios?.privacyManifests;
    expect(pm?.NSPrivacyTracking).toBe(false);
    const reasons = Object.fromEntries(
      (pm?.NSPrivacyAccessedAPITypes ?? []).map((t) => [
        t.NSPrivacyAccessedAPIType,
        t.NSPrivacyAccessedAPITypeReasons,
      ]),
    );
    expect(reasons).toEqual({
      NSPrivacyAccessedAPICategoryUserDefaults: ['CA92.1'],
      NSPrivacyAccessedAPICategoryFileTimestamp: ['C617.1'],
    });
  });

  it('blocks location, media, audio, contacts, exact alarms and the ad id on Android', () => {
    const blocked = cfg.android?.blockedPermissions ?? [];
    for (const p of [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_CONTACTS',
      'android.permission.SCHEDULE_EXACT_ALARM',
      'android.permission.USE_EXACT_ALARM',
      'com.google.android.gms.permission.AD_ID',
    ]) {
      expect(blocked).toContain(p);
    }
    expect(blocked).toEqual([...BLOCKED_ANDROID_PERMISSIONS]);
  });

  it('pins Android SDK levels (min 26, target and compile 36) and adopts iOS scenes', () => {
    expect(pluginOptions(cfg, 'expo-build-properties')).toEqual({
      android: { minSdkVersion: 26, compileSdkVersion: 36, targetSdkVersion: 36 },
      // iOS 27 asserts at launch without the UIScene life cycle.
      ios: { enableSceneSupport: true },
    });
  });

  it('takes permission strings from en.ts and never asks for the microphone', () => {
    expect(pluginOptions(cfg, 'expo-image-picker')).toEqual({
      photosPermission: permissions.photos,
      cameraPermission: permissions.camera,
      microphonePermission: false,
    });
    expect(pluginOptions(cfg, 'expo-secure-store')).toEqual({ faceIDPermission: false });
  });

  it('uses the fingerprint runtime policy', () => {
    expect(cfg.runtimeVersion).toEqual({ policy: 'fingerprint' });
  });

  it('adds no location or maps plugin in R1.0', () => {
    const names = ((cfg.plugins ?? []) as PluginEntry[]).map((p) => (Array.isArray(p) ? p[0] : p));
    expect(names).not.toContain('expo-location');
    expect(names.some((n) => n.includes('maplibre'))).toBe(false);
  });

  it('is linked to the EAS project and EAS Update', () => {
    expect(cfg.owner).toBe('wasifkarim03');
    expect(cfg.extra?.eas?.projectId).toBe('9636167e-faf3-47ce-b089-17eb9c5f216b');
    expect(cfg.updates?.url).toBe('https://u.expo.dev/9636167e-faf3-47ce-b089-17eb9c5f216b');
  });
});

describe('T-STORE blocked-permission lists stay in sync', () => {
  it('check-prebuild.mjs blocks exactly what app.config.ts blocks', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    const script = fs.readFileSync(
      `${__dirname}/../../../scripts/verify/check-prebuild.mjs`,
      'utf8',
    );
    const block = script.slice(
      script.indexOf('const BLOCKED = ['),
      script.indexOf('];', script.indexOf('const BLOCKED = [')),
    );
    const listed = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect([...listed].sort()).toEqual([...BLOCKED_ANDROID_PERMISSIONS].sort());
  });
});
