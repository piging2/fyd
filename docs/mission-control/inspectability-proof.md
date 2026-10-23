# Mission Control inspectability — 2026-10-05

The accepted frontend is the baseline (`e928c0af`). This pass composes existing reads; it introduces no backend contract, event writer, authorization rule, replay receipt schema or graph engine. FYD continues onboarding projects on behalf of tenants.

## Evidence classifications

`PROVEN` means the stated source invariant passed focused tests. `MEASURED` means an existing live response was processed and recorded. `WIRED_UNPROVEN` means implemented UI behavior has not been observed in the new browser build. `NOT_PROVEN` means the required connection or proof is absent. `BLOCKED_BY_POLICY` means a tool policy prevented visual acceptance. `UNKNOWN` identifies uninspected or inaccessible runtime behavior. Passing a build does not prove browser acceptance.

## Implemented slices

| Slice | Files under `src/` | Existing data | New contract | Validation / remaining proof | Commit |
| --- | --- | --- | --- | --- | --- |
| P1 Trace this / P7 Why this? | `components/mission-control/{trace-model,record-inspector,evidence-workspace,object-workspace}.tsx` (model is `.ts`), `__tests__/trace-model.test.ts`, `app/mission-control/workspace.css` | Mission identity, execution reference, event membership, result, evidence; object fields, correction records, exact relationship triples, source URL references | None | **PROVEN** disconnected missing nodes and exact triples; typecheck, focused lint, frontend tests passed. **WIRED_UNPROVEN** inspector interaction, URL copy, Escape/focus in the new build. | `456e96dd` |
| P2 Mission Story / Timeline / History; P3 time explanation | `components/mission-control/{mission-analysis.ts,mission-views.tsx,view-tabs.tsx,evidence-workspace.tsx}`, `__tests__/mission-analysis.test.ts`, workspace CSS | Returned event IDs/timestamps, mission/executor/tenant/result, raw response | None | **PROVEN** stable event ordering, ambiguous/missing/reversed endpoints stay unmeasured; shared selection is wired. Typecheck/lint/18 frontend tests and production build passed. **MEASURED** one live mission, nine events, four artifacts: waiting 1 ms; running 2,642 ms; publication event span 2,638 ms; result publication to terminal 2 ms. These are timestamp differences, not CPU/write duration or availability verification. **WIRED_UNPROVEN** browser view switching/history. | `0ccef2b2` |
| P4 Failure groups; P5 Why these? | `components/mission-control/{cohort-analysis.tsx,mission-analysis.ts,evidence-workspace.tsx}`, page and workspace CSS | Returned status/executor/capability/tenant/mission-start time and the current list baseline | None | **PROVEN** grouping/counts/frequencies/range handling in focused tests; typecheck/lint/18 frontend tests passed. **MEASURED** live baseline has one mission, zero failed/denied. No real failure cause or populated group was observed. **WIRED_UNPROVEN** filter/group interactions. Source/error-class/blocked/result-classification dimensions are omitted because the list does not return them. First/last labels refer specifically to returned mission-start times. | `dfc58033` |
| P6 Object shell | `components/mission-control/{object-workspace.tsx,object-views.ts}`, `__tests__/object-views.test.ts`, inspector copy cleanup | Effective fields, evidence references, fixture/source media, relationships, returned corrections/resolved journal events | None | **PROVEN** unavailable tabs omitted, failed journal lookups do not create History, unsafe media URLs rejected; typecheck/lint/22 frontend tests passed. **MEASURED** six live objects across three tenants supplied State/Evidence/Relationships, with no corrections in the inspected records. History is implemented/tested but no live corrected object was observed. Missions/Projections omitted: no returned binding. **WIRED_UNPROVEN** tab/focus/mobile/media behavior. | `563108f2` |
| Trace/filter edge cases | `trace-model.ts`, `record-inspector.tsx`, trace/mission-analysis tests | Same returned records; invalid deep-link selections | None | **PROVEN** invalid relationship/field/event selections remain disconnected; missing executor/capability group selection does not broaden to all records. Typecheck, strict focused lint and 76 tests passed. Focus restoration on unmount is **WIRED_UNPROVEN**. | `890a465c` |

Final production build passed after all implementation commits. `/mission-control`: 18.9 kB route, 122 kB first load reported by Next. Build skips its default lint; the dedicated TypeScript/hooks/accessibility lint was run separately with zero allowed warnings. Seven focused suites passed, 76 tests total. Test fixtures remain in tests; no fake runtime data was added.

## P0 browser acceptance

**BLOCKED_BY_POLICY.** Automatic approval review rejected the production preview service launch, with the stated reason “blocked by policy.” No alternative port or launch workaround was used. The already-permitted port 3100 browser path is reachable but serves the older frontend. It cannot accept this source build. The user's existing 3105 tab is an error page; that browser surface also rejected access.

Object workspace, image loading/failure, disclosures, connected-object navigation, mobile layout, current light/dark appearance, focus/Escape, back/forward/deep links and document overflow remain unobserved for this pass. Earlier baseline screenshots are historical evidence only; no screenshot is claimed for the new implementation. Source integration does not update or restart the blocked production preview.

## P8 existing replay/witness read boundary

**NOT_PROVEN** authenticated/scoped frontend read. **MEASURED** unauthenticated live reads at port 8080 returned `401 MISSING_AUTH` for all three requested paths:

- `/mc/replay/stats`
- `/mc/witness/stats`
- `/mc/replay/trace/nonexistent-contract-probe`

Existing source `gateway/routes/mission_control.js:520–626` returns replay counts/provider counters, witness counts, and correlation-group replay records with `event_id`, `timestamp`, nested `replay`, `authority`, and witnesses joined by `payload.upstreamEventId`. A missing replay group yields 404. Stats are capped at 1,000; trace defaults to 200.

The inspected route functions query event type/correlation without a caller-derived tenant/namespace predicate. `gateway/bootstrap/gateway_runtime.js` mounts `/mc` without the exterior-auth middleware used for mission-card mutations. The live 401 confirms some authentication boundary is active; its identity-to-read-scope binding is **UNKNOWN**, not disproved by this source snapshot. The Next mission `x-mc-tenant` gate explicitly says it is an assertion/accidental-isolation gate, not authentication. It cannot authorize these reads.

Stop point: the browser has no proven existing credential/session-to-replay-read-scope mapping, and these route wrappers do not establish original execution ID, replay execution ID and per-execution input/config/output hash comparison. Nested replay payload sufficiency is **UNKNOWN** without an authorized real response. A replay `verified` count or kernel reconstruction fingerprint alone must not become a worker-output MATCH.

Smallest next connection: identify the already-existing authenticated principal/read grant and the backend-enforced tenant/namespace scope for these exact GET routes; then forward that caller context through an allowlisted read adapter. Do not use a server-wide credential, trust a client-asserted tenant as a grant, or invent a scope. No adapter or new authority was fabricated in this pass.

## Deferred read-contract proposals

| Priority | Status and exact boundary | Smallest proposal |
| --- | --- | --- |
| P9 full event envelope | **NOT_PROVEN**, deliberately gated on P8. Current mission summaries expose no complete principal/namespace/causation/correlation/canonical-payload/witness/replay envelope. | Once an existing authenticated read is proven, map only the permitted returned envelope; preserve its IDs, payload and explicit missing fields. No writer or mutation. |
| P10 verified artifact preview | **NOT_PROVEN**. Mission artifacts return `path`, recorded `sha256`, publishing `event_id` and file-existence `present`; no permitted stream/URL, MIME type or computed verification status. | Extend an existing authorized artifact read, if one exists, to return permitted content plus expected hash and an actual verification result. Until then display evidence text only. Never translate local disk paths into browser URLs. Referenced object source images are a separate existing URL feature and remain labeled unverified. |
| P11 field-specific original evidence | **NOT_PROVEN** field-to-original-observation binding in the object route. Existing refresh `Claim`/`Observation` types already carry `entityId`, `field`, source URL/kind, observed time and evidence reference. They do not establish the canonical object/value's binding to a persisted original observation or producer. `/api/fyd/why-this?field=` addresses a relationship predicate, not an arbitrary object field. | Reuse those structures only after proving an existing canonical object ID + field/value → persisted observation/claim/event binding. Add that optional binding to the current object read, with actual producer/time if available and explicit absence otherwise. No universal registry or second evidence model. |
| P12 natural-language filter compilation | Optional, omitted. Deterministic editable filters and their compiled values are already visible. | Add only after browser acceptance and the forensic core. No hidden query or invented result. |

The implementation stops before any step requires inventing authentication, authorization, receipts, original field evidence or artifact access. Backend authority work remains outside these frontend commits.
