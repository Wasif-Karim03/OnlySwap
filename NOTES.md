# NOTES.md: session handoff (2026-10-23, redesign round 2 starting)

## Goal
Owner tested TestFlight build 4 (Phase 3 design overhaul) and wants more design work. Plan: HTML mockups of every screen as built (done), owner marks them up, then redesign in the mockups, then implement.

## Done so far
- Phases 1-3 of the design-only overhaul done, reviewed, committed and pushed on design/overhaul (739a532 and docs commits). TestFlight build 4 uploaded (staging backend).
- Owner bug reports fixed in d81f135 (pushed, NOT in build 4): event date/time wheels themed (textColor + themeVariant in PostNewsScreen; themeVariant in AgeScreen); "Your post" label moved into the FeedPost header row (no overlap with News); Profile grid labels events "News" instead of "Free" (priceLabel gave Free for price 0). tsc 0, 77 suites / 18927 tests.
- Mockup canvas (private claude.ai Design artifact): https://claude.ai/artifact/68qzomkMZ94Tr4SLwRfKA4 . 75 phone boards (390x844), 7 pages (auth 16, discover 9, sell 11, deals 11, feed 8, profile 14, help 6), as built from code. Files: scratchpad (50fbb23b)/mock/project/*.dc.html. Not visually verified; some settings/FAQ/legal copy is stand-in text.

## Owner feedback to design for (round 2)
- Feed should hold only news, events and normal posts; sale listings out of the Feed (product change, needs feed query/filter change, not design-only).
- Empty states ("be one of the first" + accent box in the corner) on Discover and Feed look bad; Feed empty shows two such blocks with two "List something" buttons.
- General: "designs need more improvements" across pages.
- Mockup agent also flagged: Quad looks like a different app (check against code, B5 changed it); own posts have no icon where Save sits.

## Decisions (why)
- Mockups show the current app first so redesign starts from a true baseline (owner choice).
- Local iOS builds impossible: Xcode 27.1 (Swift 6.4) vs Expo SDK 57 ExpoModulesJSI; use EAS builds (testflight, or preview ad hoc for USB install after registering the device).

## Next steps (ordered)
1. Owner reviews the canvas, comments or lists changes per screen.
2. Redesign screens in the canvas (new boards or a "proposed" page), owner approves.
3. Implement approved designs in apps/mobile (feed content change is logic: plan separately), proofs, TestFlight build 5 (includes d81f135).
4. Still open: docs/design/PHASE3_FOLLOWUPS.md items; merge origin/main (PR #35) before a PR; migration 0248 staging deploy (ask first); Turnstile key and ASC forms (owner); DEC 139 (unknown, ask owner).

## Key files/commands
- docs/design/DESIGN_REVIEW.md, docs/design/PHASE3_FOLLOWUPS.md, docs/design/SCREENS.md + screens/*.md.
- Proofs: cd apps/mobile && npx tsc --noEmit; pnpm --filter mobile lint; pnpm --filter mobile test; pnpm --filter admin typecheck|test|build.
- TestFlight: cd apps/mobile && npx eas-cli@latest build --profile testflight --platform ios --auto-submit --non-interactive.
- Canvas edits: Artifact publish with url above, root = scratchpad mock folder; type rules via Artifact read path SKILL.md.
