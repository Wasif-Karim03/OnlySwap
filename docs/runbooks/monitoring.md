# Monitoring setup (P14-MON-01, P14-MON-02, P14-MON-03)

All free tiers. Values here are public except where marked secret.

## Sentry (crashes)

1. Sentry project `onlyswap-mobile` (React Native). Put the DSN in EAS
   environment variables as `EXPO_PUBLIC_SENTRY_DSN` for `preview` and `production`.
2. Source maps: set `SENTRY_ORG` and `SENTRY_PROJECT` as EAS variables and
   `SENTRY_AUTH_TOKEN` as an EAS **secret** (org token with `project:releases`).
   The `@sentry/react-native/expo` plugin turns on only when these exist.
3. Alert rules (Alerts → Create): "A new issue is created" → email; "Number of
   events in an issue > 20 in 1 hour" → email.
4. Edge Functions: a second project `onlyswap-functions` (Node/JavaScript). Store
   its DSN as a function secret: `supabase secrets set SENTRY_DSN=... APP_ENV=staging`.
5. Test: `supabase functions invoke` any function with a bad body is not an
   error; to test, temporarily throw inside `health` on a branch, deploy to
   staging, open it once, check the email, revert.

The app drops everything when the student turns off "Crash reports" (F12).

## PostHog (18 behavior events)

1. PostHog Cloud US, project `OnlySwap`. Project settings: turn **off**
   autocapture, session replay, heatmaps, surveys and "Discard client IP data"
   **on**; person profiles "Identified only".
2. EAS variables `EXPO_PUBLIC_POSTHOG_KEY` (phc_...) and
   `EXPO_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com`.
3. Dashboard "Funnel": signup_started → email_verified → onboarding_completed →
   card_swiped → offer_sent → chat_opened → meetup_planned → deal_confirmed.

## UptimeRobot (5-minute checks, email alerts)

| Monitor | URL | Expect |
|---|---|---|
| health | `https://<ref>.supabase.co/functions/v1/health` | 200 + keyword `"ok":true` |
| media Worker | `https://<media host>/healthz` (any 404 path is fine as "up": use keyword monitor off, HTTP status < 500) | < 500 |
| site | `https://onlyswap.pages.dev/` | 200 |
| privacy | `https://onlyswap.pages.dev/privacy` | 200 |
| delete | `https://onlyswap.pages.dev/delete` | 200 |
| admin | `https://onlyswap-admin.pages.dev/` | 200 |

## Weekly usage report

`.github/workflows/usage-report.yml` runs Mondays. It fails (GitHub emails you)
when a figure passes its ARCHITECTURE §6 alert line. Secrets it needs are listed
at the top of the file.
