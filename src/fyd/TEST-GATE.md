# FYD canonical test gate

Nolan's rule (2026-09-21): before any "all green" claim, run the suites from a
clean worktree at a known SHA with this documented command. Prose does not
outrank reproducible execution.

## Environment

- NODE VERSION: v22.23.2
- PACKAGE MANAGER: npm 10.9.8
- WORKDIR: /home/nolan/projects/ping
- SHA: 5c84fe2 (fyd/sitespec-generator) — first SHA where the gate runs at all

## Commands (run from WORKDIR)

```bash
# ask lane (committed config)
npx jest --config src/fyd/ask/jest.config.cjs

# ActivityPub adapter (committed config)
npx jest --config src/fyd/adapters/activitypub/jest.config.cjs

# refresh lane (node built-in runner; repo jest has no TS transform for it)
node --test src/fyd/refresh/__tests__/*.test.ts

# proceduralize + sitespec + components: NO COMMITTED RUNNER AT THIS SHA.
# Temporary config kept at /tmp/fyd-temp.config.cjs on the Pig; mirrors the
# ts-jest inline options of the ask config. New suites MUST add a committed
# jest.config.cjs in their lane instead of relying on the temp config.
npx jest --config /tmp/fyd-temp.config.cjs
```

## Last verified result (2026-09-21, clean detached worktree, exit 0 everywhere)

| Suite | Discovered | Pass | Fail | Skip | Exit |
|---|---|---|---|---|---|
| ask | 36 | 36 | 0 | 0 | 0 |
| activitypub | 9 | 9 | 0 | 0 | 0 |
| proceduralize + sitespec + components | 50 | 50 | 0 | 0 | 0 |
| refresh | 21 | 21 | 0 | 0 | 0 |
| TOTAL | 116 | 116 | 0 | 0 | 0 |

## Why 5c84fe2 is the first gate-capable SHA

Before 5c84fe2 every FYD jest config used `preset: "ts-jest"`, which jest 30
(jest-config 30.4.1 / jest-resolve 30.4.1) cannot resolve: its
`findNodeModule("ts-jest/jest-preset")` returns null even though the file
exists. The preset contributed only transform defaults that each config
already overrides explicitly, so the preset line was deleted as a
behavior-preserving fix. Recorded in the failure ledger as FL-20260921-FYD2.

## Rules for new suites

1. Every new test suite ships with a committed `jest.config.cjs` in its lane.
2. The gate runs from a clean worktree (`git worktree add --detach`), never a
   dirty checkout.
3. Report DISCOVERED / PASS / FAIL / SKIP / EXIT per suite. A validation
   error is a FAIL, not "no tests ran".
