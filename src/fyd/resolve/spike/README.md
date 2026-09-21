# Entity Resolution Spike (FYD sprint plan item 6)

**Status: SPIKE. Not production. Not wired into anything.**

## What this proves

The compiler principle: **deterministic software handles exact matches;
only ambiguous cases consume intelligence.**

- A normalization layer for URLs, phones, addresses, and business names
  (`normalize.ts`).
- An **EXACT** tier with three named deterministic rules
  (`exact-url`, `exact-phone`, `exact-name-address`) that produce MATCH
  decisions with the rule and the normalized evidence named.
- An **AMBIGUOUS** tier that produces scored CANDIDATES isolated for
  intelligence review, **never auto-merged** (the type has no `matchedIds`
  field at all).
- An **UNMATCHED** tier that reports honestly.
- Every decision carries provenance: candidate id, corpus ref, mechanism,
  timestamp, normalizer version.

Proven on the real PING Social outreach pipeline (2026-09-21): 328
candidates (326 research-round rows + the Happy Place and Coppersmith
proceduralizer fixtures) resolved against the 318-row canonical
`western-co-prospects.jsonl` corpus. Result:

- **EXACT: 91** (88 `exact-url`, 3 `exact-phone`, 0 `exact-name-address`):
  e.g. round-53 row `Coppersmith Plumbing & HVAC`
  (`http://www.coppersmithplumbing.com/`) matches the FYD Coppersmith
  fixture (`https://www.coppersmithplumbing.com/`) via `exact-url`,
  despite different names and URL spellings. Nameless research rows
  (real data-quality edge: 4 round rows have empty business names)
  still match deterministically by URL.
- **AMBIGUOUS: 4** — e.g. `Martin's Painting` (Montrose,
  martinspainting.net) vs `RJ's Painting` (Montrose, rjspainting.com,
  score 0.55): near-identical trade, same city, but different phones
  and sites. Isolated as candidates for intelligence review, never
  merged. `Summit Sweeping & Asphalt Maintenance, LLC` vs the
  same-named corpus row in a *different* city is likewise refused an
  auto-merge: same name is not identity.
- **UNMATCHED: 233** — genuinely new research rows with no
  corroborating signal in the canonical corpus, reported honestly.

Run: 328 candidates, 318 corpus entities, 255 ms, single pass.

Demo (data lives outside the repo, passed as paths):

```sh
npx tsx src/fyd/resolve/spike/demo.ts /tmp/fyd-resolve-data/corpus.jsonl /tmp/fyd-resolve-data/candidates.jsonl
```

Tests: `npx tsx --test src/fyd/resolve/spike/__tests__/resolve.test.ts`

## What this does NOT prove

- **Production wiring**: nothing here is called by the proceduralizer,
  the refresh pipeline, or any other FYD path. That integration is a
  separate, unstarted decision.
- **`exact-name-address` on real data**: the outreach corpus has no
  street addresses, so this rule fired zero times in the real run. It is
  unit-tested with labeled synthetic addresses only.
- **Threshold calibration**: the 0.5 ambiguous threshold and feature
  weights are spike-chosen and documented, not tuned on labeled data.
- **Scale**: proven on ~650 entities. Behavior past ~100k entities
  (blocking adequacy, timing) is unmeasured.
- **Intelligence review loop**: the AMBIGUOUS tier isolates candidates
  with evidence; who reviews them and how is out of scope.
- **Unicode/multilingual names**: diacritics are stripped; anything
  beyond Latin-script business names is untested.

## Layout

- `types.ts` — entity, tier, decision, and provenance types.
- `normalize.ts` — URL / phone / name / address normalization.
- `matchers.ts` — exact rule probes + ambiguous feature scoring.
- `resolve.ts` — orchestrator: index probes, then blocked scoring, then
  honest unmatched. Deterministic.
- `demo.ts` — runnable real-data demo (see above).
- `__tests__/resolve.test.ts` — unit + real-data tests via `node:test`.
