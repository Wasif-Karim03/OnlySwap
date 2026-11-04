# NOTES.md: session handoff (2026-11-04, Phase 2 done in code; owner steps next)

## Goal
Publish OnlySwap on the App Store, iOS first, at Ohio Wesleyan (owu.edu), fully tested. Plan: docs/LAUNCH_PLAN.md
(phases 0-9, a gate after each). Owner steps only: docs/launch/OWNER_CHECKLIST.md. The owner said "do whatever best..
complete everything so that we can send it to publish".

## Done so far
- Phase 0-1 done (DEC 155-160). Phase 2 is done in code as stacked PRs, which merge in order:
  #55 (deps) <- #56 B1 copy <- #57 B2 listing <- #58 B3 large text <- #59 B4 dark theme <- #60 B5 rest
  <- #61 LR 42 + launch docs.
- B5 (#60): M5 M8 L2 L5 L10 L11 L18 L20 (819942e). The sim recheck found 3 SE ax-large breaks: profile tick
  orphaned, composer cut off, "Defau/lt" under the icons. Fixed in c6775f2 and recaptured PASS. Max dark: all B4/B5
  PASS, M12 keyboard PASS. The PR #59 and #60 test plans are ticked.
- LR 42 (#61): an account epoch (src/features/auth/accountEpoch.ts) remounts the tabs for a new session.
- LR 45: already done by migration 0254 (pgTAP 2159/2159 locally). Ticked.
- Drafts for the owner: docs/launch/OWU_SPOTS.md (6 spots, none police-designated) and
  docs/launch/LEGAL_SELF_REVIEW.md (30 PASS / 10 GAP with drafted text / 6 CHECK).
- Staging cleaned again after the sim pass: the QA campus, users and listings are deleted, and quad_enabled is back
  to false (its prior value). qa-secrets are deleted and both sims are reset.

## Decided
- LR 50 (teen significant-change holdback) is out of R1.0 (DEC 161). The Quad stays off for every campus until it
  ships. It needs LR 50 plus the 300+ users rule.
- L4 won't fix: the chip cut off at the edge is the scroll cue. L14 parts won't fix: placeholders are ink3 at 6:1,
  and the dark map and attribution are OpenFreeMap's. M8 nudge below 10 listings is by design.
- App icon picker: 4 columns at default text, 2 at large text (useLargeText).
- Earlier: L15 won't fix (DEC 90); the offer pay-in-person line stays docked; decode-uri-component is ignored.

## Current state
- Nothing is broken. Full Jest is 93 suites / 19609 tests. Under load (Docker running) one random suite can time out;
  it passes alone.
- Leftovers:
  - account_deletions 'done' rows in staging from the QA user deletes.
  - Any R2 photos the seeder uploaded.
  - The QA shadow Metro on 8081 is still running.
  - Docker Desktop is running, with the local Supabase stopped.
  - Local branch worktree-agent-ad51152546f575193 is spare and can be deleted.

## Next steps
1. Owner: merge #55 -> #61 in order, then the accounts in OWNER_CHECKLIST (phase 3).
2. Claude, after the owner picks drafts:
   - apply the legal GAP fixes. The must-fix items are the Quad "anonymous" wording in terms.md, privacy.md and
     docs/store/listing.md, and the chat-photo CSAM claim in child-safety.md.
   - update supabase/campuses/owu.sql with the approved spots. Its Campus Center address and coordinates differ
     from the research.
3. Claude, after prod-supabase.command runs: the phase 3 gate checks, then phases 4-6 per LAUNCH_PLAN.

## Key files and commands
- docs/launch/*.md, docs/LAUNCH_PLAN.md, docs/runbooks/production.md, sim-shots/qa/TRIAGE-MEDLOW.md
- Gates: cd apps/mobile && npx tsc --noEmit && pnpm lint && npx jest --ci; npx prettier --check <files>;
  gitleaks protect --staged.
- Capture: scripts/dev/qa-relaunch.sh <se|max>, then qa-irun.sh <dev> <variant> <routes> 4000.
- Staging SQL: npx --no-install supabase db query --linked -f <file> (run it from the repo root).
