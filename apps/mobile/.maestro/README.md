# Maestro E2E (P14-E2E-01)

Runs on the Mac against **staging** (TESTING §3). Setup once:

1. `curl -fsSL "https://get.maestro.mobile.dev" | bash`
2. Staging has the E2E domain (`supabase/migrations_staging/9002_e2e_domain.sql`)
   and the `test-inbox` function with secrets `E2E_SECRET` (16+ random characters)
   and `APP_ENV=staging`. Deploy it only to staging:
   `supabase functions deploy test-inbox --project-ref <staging-ref>`.
3. The reviewer account exists (`scripts/seed-review.sh`), and the demo bot cron
   is on (it plays the other person on Demo University).

Run:

```bash
maestro test apps/mobile/.maestro \
  -e FUNCTIONS_URL=https://<staging-ref>.supabase.co/functions/v1 \
  -e E2E_SECRET=... -e REVIEW_PASSWORD=... -e SITE_URL=https://onlyswap.pages.dev
```

Single flow: `maestro test apps/mobile/.maestro/flows/e2e-01-signup.yaml -e ...`.

Notes:

- The native date picker and photo picker steps use coordinates; tune them on
  the first run for your simulator size.
- Not automated here: E2E-07 (counter; needs a second human or a bot counter),
  E2E-09 (no-show; needs the time-travel RPC), E2E-16 (R1.1), E2E-19 and E2E-20
  (admin steps; see `e2e/web` admin tests plus the manual checklist in
  TESTING §4). E2E-12 is R1.1.
