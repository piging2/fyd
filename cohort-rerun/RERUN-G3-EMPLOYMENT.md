# G3 Employment Proof Rerun (2026-09-24)

Question: the 1.1.0 employs/works_for direction-agnostic matching feature had
ZERO observable effect across the cohort graphs. Was employment never
observed, observed-but-resolution-failed, or resolved-but-projection-dropped?

Method: all 8 cohort businesses through the current pipeline
(runExtractionPipeline + generateSiteSpec), with the new G3 relationship
drop ledger (every non-accepted candidate terminates in one of ACCEPTED /
REJECTED_SCHEMA / UNRESOLVED_SOURCE / UNRESOLVED_TARGET / AMBIGUOUS_TARGET /
DUPLICATE / POLICY_SUPPRESSED / UNSUPPORTED).

## Per-business classification

| business | persons observed | person objects | employment rels | employment drops | People section | verdict |
|---|---|---|---|---|---|---|
| bemis-electric | 5 | 5 (all unlinked) | 0 | 0 | no | NEVER_OBSERVED |
| gear-junction | 0 | 0 | 0 | 0 | no | NEVER_OBSERVED |
| dalby-cpa | 0 | 0 | 0 | 0 | no | NEVER_OBSERVED |
| suehiro | 0 | 0 | 0 | 0 | no | NEVER_OBSERVED |
| bistro-317 | 0 | 0 | 0 | 0 | no | NEVER_OBSERVED |
| tt-hvac | 0 | 0 | 0 | 0 | no | NEVER_OBSERVED |
| legacy-coffee | 0 | 0 | 0 | 0 | no | NEVER_OBSERVED |
| klik-boutique | - | - | - | - | - | NO_DATA (fetch exclusion, robots disallow-all; same as G1) |

## Finding

Employment was NEVER OBSERVED in any cohort source. Not one byte of
worksFor/employs/employee relationship evidence exists in the 7 fetchable
businesses: zero accepted rels, zero drops with an employment predicate.
The 1.1.0 feature is not broken; it is starved of evidence. The unit test
(`relationship-drops.test.ts`) proves the ACCEPTED path works end to end:
a named Person with a worksFor ref lands in the graph as a works_for edge.

Nuance (bemis-electric): 5 Person entities were observed and projected as
person objects, but nothing links them to the owner, and the generator's
1.1.0 people matching only follows employs/works_for edges. So 5 person
objects exist in the graph while the People section stays empty. This is
not silent: the objects are in the graph, and the absence of any linking
edge is exactly what the drop ledger would show if such evidence existed.

## Drop-ledger completeness (cohort-wide)

Every non-accepted candidate terminated in a typed outcome; the count
agrees with the ledger length in all runs. Observed firing paths:
UNRESOLVED_SOURCE (refs from entities the pipeline does not objectify,
e.g. Offer/Review nodes), UNRESOLVED_TARGET (@id refs to unvisited nodes),
POLICY_SUPPRESSED (refs into deliberately skipped site-chrome nodes),
DUPLICATE (identical triple re-emitted). AMBIGUOUS_TARGET and UNSUPPORTED
have no live firing path in the current pipeline and are documented as
such in the RelationshipOutcome doc.

## Next frontier

The employment feature needs a real business whose source actually
contains employment evidence (worksFor/employee JSON-LD) to prove the
ACCEPTED -> People-section path on real bytes. Until then the feature is
verified by unit test only. The bemis unlinked-persons pattern (person
objects with no owner edge) is a candidate for a future linking heuristic,
but inventing employment edges would violate the no-invention rule, so it
stays unlinked until evidence exists.
