# NOTES.md: session handoff (2026-10-23, design overhaul shipped to TestFlight)

## Goal
Design-only overhaul of OnlySwap (no query/RPC/route/data-shape changes), per docs/design/DESIGN_REVIEW.md. Phases 1-2 (docs) and Phase 3 (code, batches B0-B8) are done; now verify on device.

## Done so far
- Branch design/overhaul pushed to origin (tracking). Commits: 456b86a docs (phases 1-2), 739a532 Phase 3 + ~100 older uncommitted changes (Turnstile field, tab prefetch, fetch timeouts, migrations 0246-0248 + tests, launch readiness doc, audit scripts), then notes + docs/design/PHASE3_FOLLOWUPS.md.
- Final review (2 typescript-reviewers on a Phase-3-only diff): no HIGH; 11 fixes applied (admin useRpc keyed by args, dark avatar contrast, dialog focus restore, reason counter; mobile waitlist ring cap, sold-listing Save, Verify double announce, undo toast, 911 advice, es timer).
- Owner decisions applied: lilac retired on Quad pinned note (test updated with OK); legal lines restored (signIn.legal 13+, birthday privacy, Quad ruleAnon/ruleNames); commit everything in one commit.
- TestFlight build 4 (testflight profile, staging backend) built on EAS and uploaded to App Store Connect; Apple processing.
- Proofs at last run: mobile tsc 0, lint 0, 77 suites / 18927 tests; admin typecheck, 49 tests, build ok; root typecheck ok.

## Decisions (why)
- audit/raw/ gitignored: 13 MB generated exports, coverage, load logs.
- Test-pinned proposals skipped rather than editing tests; listed in docs/design/PHASE3_FOLLOWUPS.md for owner OK.
- Simulator pass replaced by TestFlight on the owner's phone: local Xcode 27.1 (Swift 6.4) cannot build Expo SDK 57 ExpoModulesJSI, precompiled or from source.

## Current state
- Working tree clean, everything pushed. Code compiles and tests pass.
- origin/main has one merge commit (PR #35 admin v2) not in design/overhaul; merge/rebase before opening a PR.
- No local iOS build possible until Xcode/Expo versions match (or use EAS development-simulator profile).

## Next steps (ordered)
1. Owner checks build 4 on iPhone: light/dark, largest Dynamic Type, Reduce Motion, chat action row with keyboard open on a small phone.
2. Fix anything found; owner decides on PHASE3_FOLLOWUPS.md items (test-pinned proposals, review notes).
3. Merge origin/main into design/overhaul, open a PR to main.
4. Older items: migration 0248 + cleanup functions deploy to staging (live DB change, ask first); real Turnstile widget/secret (owner); App Store Connect forms (owner); DEC 139 (context unknown, ask owner).

## Key files/commands
- docs/design/DESIGN_REVIEW.md, docs/design/PHASE3_FOLLOWUPS.md, docs/LAUNCH_READINESS.md.
- Proofs: cd apps/mobile && npx tsc --noEmit; pnpm --filter mobile lint; pnpm --filter mobile test; pnpm --filter admin typecheck|test|build; pnpm typecheck.
- TestFlight: cd apps/mobile && npx eas-cli@latest build --profile testflight --platform ios --auto-submit --non-interactive (build number auto-increments).
- ASC TestFlight page: https://appstoreconnect.apple.com/apps/6825936646/testflight/ios
