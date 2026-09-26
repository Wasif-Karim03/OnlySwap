---
description: Set and show the goal state for a session (S1–S44) or a task ID before starting work
argument-hint: <S# or TASK-ID>
---
Set the goal for **$ARGUMENTS** before writing any code.

1. Open `docs/GOALS.md`.
   - For a session (`S1`…`S44`): copy its **Goal**, **Checks** and **Gates** exactly.
   - For a task ID: copy its "done when" from `docs/TASKS.md`, and restate it as a specific, checkable goal.
2. Read every spec row the tasks point to (DESIGN_SYSTEM §10 screen rows, API contracts, DATA_MODEL tables, TESTING IDs). List them.
3. List any gap, conflict or ambiguity. If there is one, **stop**, add it under "Open" in `docs/DECISIONS_LOG.md`, and ask the owner. Don't guess.
4. Print this block and keep it as the contract for the work:

```
GOAL ($ARGUMENTS): <one sentence>
CHECKS:
- [ ] <task-id>: <done when>
GATES: G1 lint · G2 types · G3 unit · G4 contract · G5 security · G6 expo · G7 DB (Mac) · G8 devices · G9 E2E · G10 CI · G11 review
SPEC ROWS READ: <list>
OPEN QUESTIONS: <none | list>
```

5. Then follow the step loop in `docs/GOALS.md` §1 for each task, in order.
