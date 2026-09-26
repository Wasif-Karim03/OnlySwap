---
description: Prove the goal state for a session or task. Runs every gate and reports PASS/FAIL with evidence
argument-hint: <S# or TASK-ID>
---
Verify **$ARGUMENTS** against its goal in `docs/GOALS.md`.

1. Run every sandbox gate that applies, and show the real output tail of each:
   - G1 `pnpm lint`
   - G2 `pnpm typecheck`
   - G3 `pnpm test`
   - G4 the contract check (once it exists)
   - G5 the security scans (once they exist)
   - G6 `npx expo-doctor` and `npx expo config --type prebuild`
2. Check every item in the goal's **Checks** list, citing the evidence (test ID, command output, file).
3. Self-review the diff (`git diff main...HEAD`) against CLAUDE.md rules and DESIGN_SYSTEM §8, and list anything you find.
4. Print a table: `Check | Result (PASS/FAIL/NEEDS-MAC/NEEDS-DEVICE) | Evidence`.
5. **If anything is FAIL: fix it, then re-run the whole verify.** Don't hand over push commands until every sandbox item is PASS.
6. When all sandbox items pass, give the owner:
   - the exact Mac/device commands for G7–G9 (`bash scripts/verify/<session>.sh` once it exists) and what "pass" looks like
   - the exact push + PR commands with the real branch name
   - a PR body filled from `.github/pull_request_template.md`
