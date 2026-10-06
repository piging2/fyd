# G1 Cohort Rerun Report — 2026-09-24

Pipeline: raw acquisition HTML (cohort-raw, cohort2-raw) -> runExtractionPipeline
(proceduralizer) -> generateSiteSpec -> page inventory. 8 businesses requested;
klik-boutique excluded (robots.txt disallow-all at fetch stage: legitimate
exclusion, not a pipeline failure). 7/7 extracted, 0 stage failures.

## Results (current pipeline, post-fix)

| business | pages | public objects | schemas | explore |
|---|---|---|---|---|
| bemis-electric | home, about, explore | 6 | business, person | YES (restored) |
| gear-junction | home, about, explore | 4 | business, external_identity, location | YES (restored) |
| dalby-cpa | home, about | 1 | business | no (<4 objects) |
| suehiro | home, about | 1 | business | no (<4 objects) |
| bistro-317 | home, about | 2 | business, location | no (<4 objects) |
| tt-hvac | home | 1 | business | no (<4 objects) |
| legacy-coffee (colorado-legacy-coffee) | home, about | 1 | business | no (<4 objects) |

## Root cause (confirmed by reproduction)

The 2026-09-23 registry convergence replaced the hand-written
SCHEMA_COMPONENTS table with an inversion of the DEFINITIONS table.
The inversion dropped ObjectFeed eligibility for business, product,
location, and person schemas (the old table had them; the new
DEFINITIONS entry accepted only post/article/service/website).
explorePage gates on eligibleComponents(s).includes("ObjectFeed"), so
bemis-electric (business+person) and gear-junction (business+location)
silently lost their Explore pages. The convergence pinned the drop as
"deliberate" at the mechanism level (schemas.test.ts) but never evaluated
the page-level product effect.

## Fix (generic, committed on fyd-factory)

1. `src/fyd/components/registry.ts`: ObjectFeed.acceptsSchemas restored to
   business/product/location/person/post/article/service/knowledge-website
   (the pre-inversion product semantics). Single table, no per-business logic.
2. `src/fyd/builder/eligibility.ts`: ObjectFeed eligibility is now DERIVED
   from the component registry instead of a hand-count
   (posts+articles+services+products), so the planner can never silently
   filter a generator-emitted Explore section again. One definition, two
   consumers.
3. `src/fyd/sitespec/__tests__/schemas.test.ts`: mechanism pin updated to
   the restored semantics with the rationale recorded.
4. NEW `src/fyd/proceduralize/__tests__/page-inventory.test.ts`: the
   page-inventory / semantic-output assertion. Pins Explore presence for
   bemis-like and gear-like graphs, pins planner/generator agreement
   (emitted section => eligible), pins no silent invention for sparse graphs.

## Verification

- Pre-fix rerun: bemis-electric and gear-junction lost Explore vs the
  pre-inversion baseline (drift confirmed, EXPLORE_PAGE_DRIFT on 2/7).
- Post-fix rerun: Explore present for both; zero drift vs baseline on all 7.
- Suites: proceduralize 89/89, sitespec 92/92, builder 100/100.

Raw machine-readable results: `rerun-g1-results.json` (this directory).
Rerun script: `rerun-g1.mts` (this directory).
