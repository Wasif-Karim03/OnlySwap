import type { ConfigContext, ExpoConfig } from 'expo/config';

import tokens from '@onlyswap/tokens/tokens.json';

import permissions from './src/strings/permissions.json';
import widgetCopy from './src/strings/widgets.json';

/**
 * Locked native config (TASKS P1-SETUP-04). Every value here is asserted by
 * `__tests__/appConfig.test.ts` and, after prebuild, by
 * `scripts/verify/check-prebuild.mjs` (T-STORE). Change both when this changes.
 */

// Launch colors come from the design tokens (DESIGN_SYSTEM §2, P2-TOK-01).
const BRAND = {
  accent: tokens.color.accents[tokens.color.defaultAccent as 'pistachio'].accent,
  bgLight: tokens.color.light.bg,
  bgDark: tokens.color.dark.bg,
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
  // WorkManager (androidx.work 2.8.1, pinned in DEC 86) declares this for
  // long-running workers. Nothing in the app runs a foreground service, and
  // Play needs a declared service type for it at target SDK 34+ (DEC 88).
  'android.permission.FOREGROUND_SERVICE',
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

/**
 * Alternate app icons (R2-ICON-01, board F14: Night, Paper, Mono; Default is
 * the main icon). Names must match NATIVE_ICON_NAMES in
 * src/features/appIcon/logic.ts. Images: assets/images/app-icons/generate.py.
 */
export const ALT_APP_ICONS = [
  { name: 'Night', file: 'night', background: tokens.color.dark.bg },
  { name: 'Paper', file: 'paper', background: tokens.color.light.bg },
  { name: 'Mono', file: 'mono', background: tokens.color.dark.card },
] as const;

/** iOS App Group shared by the app and the widget extension (expo-widgets). */
export const WIDGET_APP_GROUP = `group.${BUNDLE_ID}`;
/** Widget kind (iOS) / widget name (Android); must match features/widgets. */
export const WIDGET_NAME = 'NextMeetup';

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
    // Web = the student web app (P13-WEB-07, F36/W08): the same routes exported
    // as a single-page app to Cloudflare Pages (`onlyswap-web`, WEB_DEPLOY.md).
    platforms: ['ios', 'android', 'web'],
    web: {
      bundler: 'metro',
      output: 'single',
      name: 'OnlySwap',
      shortName: 'OnlySwap',
      lang: 'en',
      themeColor: BRAND.bgLight,
      backgroundColor: BRAND.bgLight,
      favicon: './assets/images/favicon.png',
    },
    scheme: 'onlyswap',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    icon: './assets/images/icon.png',
    runtimeVersion: { policy: 'fingerprint' },
    updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}` },
    extra: { eas: { projectId: EAS_PROJECT_ID } },
    ios: {
      bundleIdentifier: BUNDLE_ID,
      // iPad (P17-FEAT-02): phones stay portrait (`orientation`); with
      // requireFullScreen off, prebuild adds all four iPad orientations
      // (UISupportedInterfaceOrientations~ipad) for Split View and Slide Over.
      supportsTablet: true,
      requireFullScreen: false,
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
      // App Links for listing share links (P11-STATE-02); verified by assetlinks.json on the site.
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          // Listing shares and invites (R11-INVITE-01); must match APP_PATHS in
          // apps/site/scripts/well-known.mjs.
          data: [
            { scheme: 'https', host: WEB_HOST, pathPrefix: '/l/' },
            { scheme: 'https', host: WEB_HOST, pathPrefix: '/i/' },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
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
          // iOS 27 asserts at launch unless the app adopts the UIScene life
          // cycle (crash found on the iOS 27 Simulator). SDK 57's opt-in; SDK 58
          // does this in the template.
          ios: { enableSceneSupport: true },
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
      // R11-MAP-01 spots map. The plugin only sets Gradle properties and Podfile
      // hooks; its manifest asks for location, which BLOCKED_ANDROID_PERMISSIONS
      // strips. No NSLocation* usage string is added (spots only, DEC 35).
      '@maplibre/maplibre-react-native',
      // P17-FEAT-01: iOS "Next meetup" widget + meetup Live Activity (WidgetKit
      // extension, App Group). No push to Live Activities: the app starts,
      // updates and ends them itself ($0, no APNs server).
      [
        'expo-widgets',
        {
          groupIdentifier: WIDGET_APP_GROUP,
          enablePushNotifications: false,
          widgets: [
            {
              name: WIDGET_NAME,
              displayName: widgetCopy.nextMeetupName,
              description: widgetCopy.nextMeetupDescription,
              ios: { supportedFamilies: ['systemSmall', 'systemMedium'] },
            },
          ],
        },
      ],
      // P17-FEAT-01: Android "Next meetup" home screen widget.
      [
        'react-native-android-widget',
        {
          widgets: [
            {
              name: WIDGET_NAME,
              label: widgetCopy.nextMeetupName,
              description: widgetCopy.nextMeetupDescription,
              minWidth: '110dp',
              minHeight: '110dp',
              targetCellWidth: 2,
              targetCellHeight: 2,
              resizeMode: 'horizontal|vertical',
              // Redraw every 30 min (the minimum) so an ended meetup drops off.
              updatePeriodMillis: 1_800_000,
            },
          ],
        },
      ],
      // R2-ICON-01: alternate icons (iOS alternate icons, Android activity-alias).
      [
        'expo-alternate-app-icons',
        ALT_APP_ICONS.map((icon) => ({
          name: icon.name,
          ios: `./assets/images/app-icons/${icon.file}.png`,
          android: {
            foregroundImage: `./assets/images/app-icons/${icon.file}-foreground.png`,
            backgroundColor: icon.background,
            monochromeImage: './assets/images/android-icon-monochrome.png',
          },
        })),
      ],
      ['./plugins/withReleaseHardening', { variant }],
      './plugins/withWorkRuntimeFix',
      // Source maps and native symbols upload during EAS builds (P14-MON-01). Needs
      // SENTRY_ORG / SENTRY_PROJECT (build env) and SENTRY_AUTH_TOKEN (EAS secret).
      ...(process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
        ? [
            [
              '@sentry/react-native/expo',
              { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT },
            ] as [string, Record<string, string>],
          ]
        : []),
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  };
};
