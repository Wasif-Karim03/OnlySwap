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
] as const;

/** `development` | `preview` | `production`, set per profile in eas.json. */
export type AppVariant = 'development' | 'preview' | 'production';

function appVariant(): AppVariant {
  const v = process.env.APP_VARIANT;
  return v === 'production' || v === 'preview' ? v : 'development';
}

export default ({ config }: ConfigContext): ExpoConfig => {
  // Set after `eas init` on the owner's machine; not a secret.
  const easProjectId = process.env.EAS_PROJECT_ID;
  const variant = appVariant();

  return {
    ...config,
    name: 'OnlySwap',
    slug: 'onlyswap',
    owner: process.env.EXPO_OWNER,
    version: '1.0.0',
    platforms: ['ios', 'android'],
    scheme: 'onlyswap',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    icon: './assets/images/icon.png',
    runtimeVersion: { policy: 'fingerprint' },
    updates: easProjectId ? { url: `https://u.expo.dev/${easProjectId}` } : undefined,
    extra: easProjectId ? { eas: { projectId: easProjectId } } : undefined,
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
