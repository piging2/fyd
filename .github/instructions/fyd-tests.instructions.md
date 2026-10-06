---
applyTo: "**/*.test.ts,**/*.test.tsx,**/jest.config.cjs"
---

# FYD test instructions

Tests are the adjudicator. The deterministic suite decides between
competing agent claims; prose does not outrank reproducible execution.

## Rules

- The canonical gate is defined in src/fyd/TEST-GATE.md. Run exactly the
  commands it documents, from a clean worktree at a known SHA.
- TypeScript must be clean: npx tsc --noEmit.
- Every new test suite ships with a committed jest.config.cjs in its own
  lane, e.g. npx jest --config src/fyd/ask/jest.config.cjs. Do not rely on
  temporary or uncommitted configs. (The untracked src/fyd/jest.config.cjs
  has an invalid root configuration and is not an accepted substitute.)
- Report DISCOVERED / PASS / FAIL / SKIP / EXIT per suite. A config or
  validation error is a FAIL, not "no tests ran".
- Never silently skip a failing suite. Classify with evidence as one of:
  REGRESSION (broke something that was green), PRE-EXISTING (broken before
  this change, with the SHA that proves it), STALE TEST (asserts behavior
  the product intentionally no longer has), or ENVIRONMENT (machine or
  dependency issue, reproducible outside the repo).
- New behavior needs tests that fail before the fix and pass after. New
  invariants (one read model, no invented claims, tenant isolation, stale
  proposal rejection) need permanent regression tests, not one-off scripts.

## Agent output contract

Return: QUESTION / EVIDENCE / FILES INSPECTED / CODE/HISTORY HARVESTED /
EXTERNAL MATERIAL REVIEWED / ASSUMPTIONS FALSIFIED / RECOMMENDATION /
ADOPT / ADAPT / REJECT / TEST COMMAND / RISKS / NEXT HIGHEST-LEVERAGE
ACTION. No architecture essays without evidence.
