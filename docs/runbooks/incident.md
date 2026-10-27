# Incident runbook (RELEASE §7, SECURITY §7, audit J-02)

For when something is broken or unsafe in production. One person (the owner)
runs it, so it is written to be followed in order, under stress, from a phone
if needed. Every switch below is $0 and works without a new build.

## 1. Detect

Alerts land in the owner's email (RELEASE §7, `monitoring.md`):

| Signal | Source |
|---|---|
| Crash or error spike, crash-free < 99% | Sentry |
| `health`, media Worker, site, admin down | UptimeRobot (5 min) |
| Priority-1 report (threat, self-harm, minor safety) | `priority_report` email |
| Free-tier limit near | weekly usage report |
| R2 spend over $1 | Cloudflare notification |

Users also report through the support form and `onlyswap.app@gmail.com`.

Start a notes file right away: `docs/incidents/YYYY-MM-DD-short-name.md`
(template in §7). Write down times as you go; the postmortem needs them.

## 2. Classify

| Sev | Meaning | Examples | Target |
|---|---|---|---|
| SEV1 | Data exposure, auth broken, or a safety threat | RLS lets users read others' rows; a leaked service key; sign-in works for the wrong person; a credible threat or CSAM | Contain within 1 h, any hour |
| SEV2 | A core flow is broken for many users | can't sign in, post, offer, or chat; push or email stopped | Fix the same day |
| SEV3 | Minor or one user | a screen glitch, one stuck listing | Next working session |

When unsure, pick the higher one. You can lower it later.

## 3. Contain

Pick the smallest switch that stops the harm. All `admin_*` calls are in the
admin console (Config, Campuses, People) and each writes an `audit_log` row;
give a real reason.

| Situation | Switch |
|---|---|
| Backend down or a bad migration is corrupting data | Config → `maintenance` = `{"enabled": true, "until": null}`. Apps show the X12 maintenance screen on their next cold launch (the launch gate reads it once); apps already open keep running and see errors until restarted. Set `until` to an ISO time and the screen shows it. |
| One campus has an abuse wave | Campuses → set status `paused` (`admin_update_campus`) |
| The Quad is the problem | Config → `quad_enabled` = `false` |
| Chat photos are the problem | Config → `chat_photos_enabled` = `false` |
| A JS release is broken | `eas update:republish` the previous update group to `production` (RELEASE §4); it applies on the next cold start |
| A native build is broken | pause the iOS phased release; halt the Play staged rollout; ship a fix build with expedited review |
| An old build must stop working | Config → `min_version_ios` / `min_version_android` |
| One account is abusive or compromised | People → suspend or ban (`admin_set_user_status`); this calls `revoke-sessions`, which signs them out everywhere |
| A secret leaked | rotate it (§4) |
| Everyone must sign in again | Supabase dashboard → Settings → JWT keys → rotate. Every session ends; codes still work. Last resort. |
| CSAM | follow SECURITY §7 exactly: remove, preserve evidence privately, report to NCMEC CyberTipline, ban, don't view or share |

## 4. Rotate a secret

The list and where each one lives is SECURITY §4. For each leaked secret:

1. Make a new one at the provider (Supabase, Cloudflare R2, Gmail app password
   or Resend, Expo, Turnstile).
2. Put it everywhere it lives: `supabase secrets set ...`, Vault
   (`vault.update_secret`) for pg_net callers, GitHub Actions secrets, EAS
   secrets, Supabase Auth SMTP settings for the mail password.
3. Revoke the old one at the provider.
4. Redeploy the functions that read it (`supabase functions deploy <name>`)
   and run the staging smoke checks.
5. `gitleaks detect` and check git history if the leak came from the repo.

Never rotate `EMAIL_HASH_PEPPER`, `QUAD_ALIAS_SECRET` or the backup `age` key:
it breaks every hash and alias. If one of those leaked, treat it as SEV1 and
decide with a written plan, not in the moment.

## 5. Fix and deploy

- **Database:** forward-fix with a new migration (never edit an applied one).
  Write the pgTAP test that reproduces the bug first. Apply to staging, check,
  then production (`supabase db push --linked`).
- **Lost or broken rows:** restore last night's dump into a temp schema
  (`restore.md`) and copy back only the rows you need. Don't restore over
  production.
- **Functions:** `supabase functions deploy <name>`.
- **App JS:** fix, test, `eas update --channel production`.
- **App native:** fix build plus expedited review; keep the containment switch
  on until the fix is live.
- Turn the switches from §3 back off and write down when.

## 6. Tell people

- **Data exposure (SEV1):** email the affected users within 72 hours of
  confirming it: what was exposed, when, what we did, what they should do. Keep
  the list of affected user ids in the incident file (ids, not emails). Check
  whether any state law needs more (most US breach laws cover email plus
  password or government ids, which OnlySwap doesn't hold, but check).
- **Outage longer than an hour:** the maintenance screen covers app users; for
  a campus that was paused, send one short email when it reopens.
- **Store reviewers:** if a build was pulled or a review is pending, reply in
  App Store Connect / Play Console with a plain explanation.
- Voice: plain, no blame, no em dashes, say what happened and what changes.

## 7. Postmortem

Within a week, finish `docs/incidents/YYYY-MM-DD-short-name.md`:

```markdown
# <short name> (SEV<n>, YYYY-MM-DD)

## Summary
Two or three sentences: what broke, who it hit, how long.

## Timeline (local time)
- HH:MM detected by ...
- HH:MM contained by ...
- HH:MM fixed by ...
- HH:MM switches off

## Impact
Users or campuses affected, data exposed (if any), notices sent.

## Cause
What actually went wrong, down to the line or setting.

## What changes
- [ ] test that would have caught it (ID)
- [ ] fix or guard (PR, DEC row if it changes a rule)
- [ ] runbook or alert change
```

Add a `docs/DECISIONS_LOG.md` row for anything that changes a rule, and update
this runbook if a step was missing or wrong.
