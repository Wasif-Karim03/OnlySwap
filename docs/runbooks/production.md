# Production setup (onlyswap-prod)

Staging (`onlyswap-staging`) stays the test backend. Production is a clean copy with real keys and no test tools. Run everything from `~/Code/OnlySwap` on the Mac, on `main` after `fix/audit-1` is merged. Keys are typed at hidden prompts and kept in the macOS Keychain under the account `onlyswap-prod`; never paste them into chat or commit them.

## 0. Before you start (dashboards, about 1 to 2 hours)

| Where | Make | Used by |
|---|---|---|
| Supabase | Pause `intention` (frees the second free slot) | prod-supabase |
| Domain registrar | Buy the domain (about $10 a year), add it to Cloudflare (free plan), switch the nameservers | everything below |
| Google | A Gmail sender for production, 2-Step Verification on, an app password named OnlySwap | prod-supabase |
| Cloudflare, Turnstile | A widget for the domain (Managed). Site key and secret | both scripts |
| Cloudflare, R2 | Account API token, Object Read and Write, scoped to `onlyswap-media` and `onlyswap-private` (create the buckets first or let the script make them, then scope the token) | cloudflare-prod |
| Cloudflare, API tokens | Custom token, Account / Workers AI / Read | prod-supabase |
| Sentry | Projects `onlyswap-mobile` and `onlyswap-functions` | prod-supabase, eas-prod-env |
| PostHog | Project for production, IP capture and GeoIP off | eas-prod-env |
| App Store Connect | App record for `app.onlyswap`; send Claude the Apple ID (numbers) for `eas.json` | eas submit |

## 1. Backend

```bash
bash scripts/deploy/prod-supabase.command
```

Creates the project, applies `supabase/migrations` only (never `migrations_staging`), sets `app.env = prod`, pushes Auth settings, writes Vault secrets (a new email pepper that is kept forever), sets function secrets and deploys every function except `test-inbox`. Ends with a `health` check. Then in the dashboard, Authentication, read back: custom SMTP on, rate limits (200 emails an hour, 30 sign-ins and 30 verifications per 5 minutes), OTP length 6, expiry 600 s, both hooks on.

## 2. Cloudflare

```bash
bash scripts/deploy/cloudflare-prod.command
```

Buckets, CORS (your site and `app.` only), the media Worker on `media.<domain>`, R2 keys for the functions, the website, the admin console and the web app. Then add the custom domains it prints (site on the domain, `admin.`, `app.`). Turn on the CSAM Scanning Tool (`docs/runbooks/photo-screening.md`). Accept the Workers AI license once (same runbook).

## 3. Data

```bash
bash scripts/deploy/add-campus.command owu prod                       # Ohio Wesleyan, live, Meetup spots
bash scripts/seed-review.sh https://<prod-ref>.supabase.co            # review account on Demo University
```

`seed-review.sh` asks for the service key: Supabase dashboard, Project Settings, API keys, the secret key. Keep the reviewer password for the App Review notes.

Then in the SQL editor:

```sql
-- Global Quad switch. Only campuses with their own switch on (Demo University) get the Quad.
update public.app_config set value = 'true'::jsonb where key = 'quad_enabled';
```

Add more Meetup spots for Ohio Wesleyan in the admin console if you want more than the Campus Center.

## 4. Admin console

1. Sign up in the app with your `owu.edu` email.
2. SQL editor: `insert into public.admins (user_id, role) select id, 'owner' from auth.users where email = '<you>';`
3. `update private.admin_settings set mfa_required = true;`
4. Sign in at `admin.<domain>`, enrol two-factor on two devices.

## 5. App build

```bash
bash scripts/deploy/eas-prod-env.command        # EAS production variables
cd apps/mobile
npx eas-cli build --profile production -p ios
npx eas-cli submit -p ios --latest
```

## 6. Smoke test before handing the build to anyone

- `https://<prod-ref>.supabase.co/functions/v1/health` answers ok
- Sign up with a real `owu.edu` inbox, the code email arrives
- Post a listing with a photo; the photo loads from `media.<domain>`; `select status from private.photo_scans order by id desc limit 1` shows `ok` a minute later
- The privacy, terms and delete pages load on the site
- App Store Connect, App Store Server Notifications: Production and Sandbox URL `https://<prod-ref>.supabase.co/functions/v1/app-store-notifications`, version 2; send a test notification and see `appstore_ignored` in the function log

## Never on production

`test-inbox`, `E2E_SECRET`, Cloudflare test keys (`1x0000...`), `migrations_staging`, mock data (`owu-mock.sql`), `VITE_APP_ENV=staging`.
