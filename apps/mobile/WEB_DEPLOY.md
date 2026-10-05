# Student web app: build and deploy (P13-WEB-07, F36, W08)

The web app is this Expo app exported for browsers: the same routes, screens
and RPCs as the phone app, with web stand-ins for phone-only modules. It is a
static single-page app on the Cloudflare Pages free plan (project
`onlyswap-web`). $0.

## What is different on web

| Area | Web behaviour | Where |
|---|---|---|
| Storage | localStorage under the `onlyswap:` prefix (memory fallback); the Supabase session uses the standard supabase-js browser storage | `src/lib/storage.web.ts` |
| Keyboard | react-native-keyboard-controller swapped for plain views | `src/shims/keyboardController.web.tsx`, `metro.config.js` |
| Styles | Unistyles processes GestureHandlerRootView, expo-image and FlashList on web only | `babel.config.js` |
| Launch gate | no store version check, no push primer | `features/auth/logic.ts` (`platform: 'web'`) |
| Push | never registers, no badge, no OS-off banner | `src/lib/push.ts`, `NotificationSettingsScreen` |
| Photos | file picker only (no camera tile); canvas re-encode to WebP drops EXIF | `PhotoGrid`, `lib/media.ts` |
| Age check | the browser date field | `components/WebDateInput.tsx` |
| Map | not bundled; the Meetup spot list stays | `features/meetups/SpotsMap.web.tsx` |
| Settings | app icon picker and Live Activity switch hidden | `features/appIcon/AppearanceExtras.tsx` |
| Discover | always a grid with Skip, Save and Make an offer | `features/feed/DiscoverScreen.tsx` |
| Desktop | wide layout from `src/theme/layout.ts` at 1024+ (sidebar, two-pane Inbox) | unchanged |
| Titles | "Page \| OnlySwap" per route | `src/lib/webTitle.ts` |
| Keys | Enter sends forms and chat; Shift+Enter is a new line in chat | `lib/platform.ts` `enterSends` |

## Build

```bash
pnpm i
cd apps/mobile
# EXPO_PUBLIC_* come from .env.local locally, or the Pages build env.
pnpm export:web            # = expo export -p web → apps/mobile/dist
npx serve dist --single    # local check (any static server with SPA fallback)
```

`public/` is copied into `dist/`: `index.html` (page template with the focus
ring), `_headers` (CSP and security headers) and `_redirects`.

## Environment variables (build time, public)

Same as the phone app (`.env.example`); they are inlined into the bundle.

| Name | Production value |
|---|---|
| `EXPO_PUBLIC_APP_ENV` | `production` |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://<project>.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | the anon/publishable key (never `sb_secret_`) |
| `EXPO_PUBLIC_MEDIA_URL` | the media Worker URL |
| `EXPO_PUBLIC_SITE_URL` | `https://onlyswap.pages.dev` |
| `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST` | optional |

## Cloudflare Pages (`onlyswap-web`)

Either connect the GitHub repo in the Pages dashboard:

- Build command: `pnpm i --frozen-lockfile && pnpm --filter mobile export:web`
- Build output directory: `apps/mobile/dist`
- Environment variables: the table above, plus `NODE_VERSION=22`

or deploy a local build:

```bash
npx wrangler pages project create onlyswap-web --production-branch main
npx wrangler pages deploy apps/mobile/dist --project-name onlyswap-web
```

Routing: the export has no top-level `404.html`, so Pages serves `index.html`
for every unknown path and Expo Router shows the screen (or its not-found
screen). `/l/<id>` redirects to `/listing/<id>`.

## Security headers (`public/_headers`)

- CSP: `script-src 'self'` (no inline scripts, no eval); `connect-src` allows
  `*.supabase.co` (https + wss for Realtime), `*.r2.cloudflarestorage.com`
  (presigned photo uploads), `*.workers.dev`, Sentry ingest and PostHog;
  `img-src https: data: blob:`; `frame-ancestors 'none'`.
- If the media Worker or Supabase move to a custom domain, add it to
  `connect-src`. Local testing against `http://127.0.0.1:54321` needs a
  dev server without these headers (`npx expo start --web`).
- `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy` with camera,
  microphone, geolocation and payment off (the photo file picker still works).

## Backend changes the web app needs (outside apps/mobile)

1. `upload-url` Edge Function: answer `OPTIONS` and send CORS headers like
   `delete-account` does. Without it, browser photo uploads fail.
2. R2 bucket CORS (`onlyswap-media`, `onlyswap-media-staging`): allow `PUT`
   with `content-type` from the web app origin(s).
3. Media Worker: `Access-Control-Allow-Origin` on image responses, so the
   share card capture (Posted screen) can read the photo. Without it the
   share image is skipped (best effort, the listing still posts).
