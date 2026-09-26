import type { ConfigContext, ExpoConfig } from 'expo/config';

import permissions from './src/strings/permissions.json';

/**
 * Locked native config (TASKS P1-SETUP-04). Every value here is asserted by
 * `__tests__/appConfig.test.ts` and, after prebuild, by
 * `scripts/verify/check-prebuild.mjs` (T-STORE). Change both when this changes.
 */

// Launch colors mirror DESIGN_SYSTEM §2 (`accent` Pistachio, `bg`, `ink`).
// Native config can't read Unistyles tokens; S4 (P2-TOK-01) keeps these in sync.
const BRAND = {
  accent: '#C8E27D',
  bgLight: '#FFFFFF',
  bgDark: '#0C0C0D',
} as const;

export const BUNDLE_ID = 'app.onlyswap';
// Created by `eas init` (@wasifkarim03/onlyswap). Public identifiers, not secrets.
export const EAS_PROJECT_ID = '9636167e-faf3-47ce-b089-17eb9c5f216b';
export const EXPO_OWNER = 'wasifkarim03';
export const WEB_HOST = 'onlyswap.pages.dev';

export const BLOCKED_ANDROID_PERMISSIONS = [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.RECORD_AUDIO',
  'android.permission.READ_CONTACTS',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_EXACT_ALARM',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'com.google.android.gms.permission.AD_ID',
  // Launcher badge permissions added by ShortcutBadger (via expo-notifications).
  // Android 8+ shows notification dots without them; blocked to keep the
  // Play permission list minimal (DEC 42 CI check).
  'android.permission.READ_APP_BADGE',
  'com.android.launcher.permission.READ_SETTINGS',
  'com.android.launcher.permission.WRITE_SETTINGS',
  'com.android.launcher.permission.INSTALL_SHORTCUT',
  'com.android.launcher.permission.UNINSTALL_SHORTCUT',
  'com.sec.android.provider.badge.permission.READ',
  'com.sec.android.provider.badge.permission.WRITE',
  'com.htc.launcher.permission.READ_SETTINGS',
  'com.htc.launcher.permission.UPDATE_SHORTCUT',
  'com.sonyericsson.home.permission.BROADCAST_BADGE',
  'com.sonymobile.home.permission.PROVIDER_INSERT_BADGE',
  'com.anddoes.launcher.permission.UPDATE_COUNT',
  'com.majeur.launcher.permission.UPDATE_BADGE',
  'com.huawei.android.launcher.permission.CHANGE_BADGE',
  'com.huawei.android.launcher.permission.READ_SETTINGS',
  'com.huawei.android.launcher.permission.WRITE_SETTINGS',
  'com.oppo.launcher.permission.READ_SETTINGS',
  'com.oppo.launcher.permission.WRITE_SETTINGS',
  'me.everything.badger.permission.BADGE_COUNT_READ',
  'me.everything.badger.permission.BADGE_COUNT_WRITE',
] as const;

/** `development` | `preview` | `production`, set per profile in eas.json. */
export type AppVariant = 'development' | 'preview' | 'production';

function appVariant(): AppVariant {
  const v = process.env.APP_VARIANT;
  return v === 'production' || v === 'preview' ? v : 'development';
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = appVariant();

  return {
    ...config,
    name: 'OnlySwap',
    slug: 'onlyswap',
    owner: EXPO_OWNER,
    version: '1.0.0',
    platforms: ['ios', 'android'],
    scheme: 'onlyswap',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    icon: './assets/images/icon.png',
    runtimeVersion: { policy: 'fingerprint' },
    updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}` },
    extra: { eas: { projectId: EAS_PROJECT_ID } },
    ios: {
      bundleIdentifier: BUNDLE_ID,
      supportsTablet: false,
      deploymentTarget: '16.4',
      config: { usesNonExemptEncryption: false },
      associatedDomains: [`applinks:${WEB_HOST}`],
      entitlements: {
        'com.apple.developer.usernotifications.time-sensitive': true,
        'com.apple.developer.declared-age-range': true,
      },
      privacyManifests: {
        NSPrivacyTracking: false,
        NSPrivacyTrackingDomains: [],
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
            NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
          },
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
            NSPrivacyAccessedAPITypeReasons: ['C617.1'],
          },
        ],
      },
    },
    android: {
      package: BUNDLE_ID,
      adaptiveIcon: {
        backgroundColor: BRAND.accent,
        foregroundImage: './assets/images/android-icon-foreground.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      blockedPermissions: [...BLOCKED_ANDROID_PERMISSIONS],
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 88,
          backgroundColor: BRAND.bgLight,
          dark: {
            image: './assets/images/splash-icon-dark.png',
            backgroundColor: BRAND.bgDark,
          },
        },
      ],
      [
        'expo-build-properties',
        {
          android: {
            minSdkVersion: 26,
            compileSdkVersion: 36,
            targetSdkVersion: 36,
          },
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: permissions.photos,
          cameraPermission: permissions.camera,
          microphonePermission: false,
        },
      ],
      [
        'expo-notifications',
        {
          enableBackgroundRemoteNotifications: false,
        },
      ],
      [
        'expo-secure-store',
        {
          faceIDPermission: false,
        },
      ],
      ['./plugins/withReleaseHardening', { variant }],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  };
};
