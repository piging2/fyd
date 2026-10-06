# Testing

## Canonical command

Run the whole suite from the repo root:

```bash
npx jest
```

`npm test` runs the same thing. This uses `jest.config.cjs` at the repo root
(ts-jest, node environment, `@/` alias mapped to `src/`, CSS imports stubbed
via `jest/css-stub.cjs`). It discovers every suite under
`<rootDir>/src/**/__tests__/*.test.{ts,tsx}`, including areas that never had their own config
(attention, claim, refresh, resolve/spike, rank, `src/lib`, `src/lib/ping`).

Do not invent scratch configs in /tmp: results from ad-hoc configs are not
reproducible and are not the standard.

## Per-area configs

Each lane keeps its own scoped config for local runs, e.g.:

```bash
npx jest --config src/fyd/customize/jest.config.cjs
```

All 26 per-area configs are functionally identical (same ts-jest transform and
inline tsconfig, same `@/` mapping); they differ only in testMatch scope and
the CSS-stub variant. The root config is the standard entry point; the
per-area configs remain for lane-local iteration.

## Known-failing suites (pre-existing, not caused by the runner)

Full run 2026-09-27 via `npx jest`: 207 suites, 196 passed, 11 failed;
2230 tests passed, 22 failed. Every failing suite below was re-run under its
own per-area config (where one exists) and fails identically there, so the
root config introduces zero regressions. No test or production file was
changed to accommodate the runner.

Pre-existing failures in areas WITH a per-area config (fail identically via
`npx jest --config <lane>/jest.config.cjs`):

- `src/fyd/proceduralize/__tests__/generator.test.ts` — 1 failing test:
  "generateSiteSpec Gallery emission (media-backed) › emits no Gallery
  section when the site manifest has no gallery assets". Tracked manifest
  issue; not a runner problem.
- `src/fyd/builder/__tests__/structural-proof.test.ts` — "structural proof:
  two tenants, one planner › coppersmith-plumbing vs ping-fyd are materially
  different". Fails at binding-verifier (owner-asserted provenance cannot back
  direct evidence on ping-fyd-business#title).
- `src/fyd/builder/__tests__/ping-fyd-error-gate.test.ts` — "control: the
  untouched ping-fyd projection composes". Same binding-verifier refusal.
- `src/fyd/builder/__tests__/ping-fyd-dogfood-render.test.ts` — 4 failing tests,
  BindingVerificationError (owner-asserted provenance cannot back direct evidence)
  thrown from composePingFyd in the test body.
- `src/fyd/components/__tests__/ping-fyd-dogfood.test.ts` — 4 failing tests,
  all the same binding-verifier refusal on ping-fyd factual bindings.
- `src/fyd/object/__tests__/by-id.test.ts` — "loadObjectViewById › loads the
  business object by id" and "loadCircleProjectionById › gradient background
  is deterministic and matches the media-lane convention". Media/projection
  expectation mismatches (extra gallery photo objects, gradient values).
- `src/fyd/object/__tests__/circle-projection.test.ts` — 3 failing tests
  around resolveCircleBackground gradients and tagline word-boundary.
- `src/fyd/object/__tests__/view.test.ts` — "loadObjectView › loads the Happy
  Place view from the PING-backed projection". Same media/projection drift.

Exceptions in areas with NO prior standard invocation (previously unrunnable
under any standard config; now runnable under the root config but failing on
their own merits, not runner issues):

- `src/fyd/claim/__tests__/attack-verifier-holes.test.ts` — "H5: per-field
  evidence is unrepresentable › a binding's own evidenceRef is honored, not
  silently replaced": expects DIRECT_EVIDENCE, gets UNKNOWN. Test assertion
  vs verifier behavior mismatch.
- `src/lib/__tests__/assignment-store-kv.test.ts` — 4 failing tests in
  "assignment-store KV credential resolution": CAS enforcement throws because
  expectedRevision is required; the tests do not supply it.
- `src/lib/__tests__/media-authority-route.test.ts` — suite fails to run:
  it does `jest.mock('@/lib/workbench-session', ...)` but
  `src/lib/workbench-session` does not exist in the repo.

## Notes

- `jest.config.cjs` comment hygiene: never write a literal `*/` inside a
  block comment (e.g. the glob `src/**/__tests__` contains one and silently
  terminates the comment). This bit the initial version of this config.
