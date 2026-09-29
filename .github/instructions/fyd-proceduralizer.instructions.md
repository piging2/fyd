---
applyTo: "src/fyd/proceduralize/**"
---

# FYD proceduralizer instructions

This area turns the evidence/object graph into SiteSpec (the Layer 2
experience spec). It covers the planner (src/fyd/builder/planner.ts,
eligibility.ts) and the generator (src/fyd/proceduralize/generator.ts).

## Rules

- Intelligence produces typed data (SitePatch and friends). It never produces
  arbitrary JSX or imperative DOM mutations.
- The planner decides what is known and eligible; the generator decides how
  to present it. Keep that boundary clean.
- Every generated factual value must carry its copy class: DIRECT (object
  field), DERIVED (evidence-backed derivation, labeled), GENERATED
  PRESENTATION (explicitly labeled as generated), or OWNER COPY. A binding
  verifier owns "no invented claims" at the render boundary; do not invent
  bindings to fields that do not exist.
- Visibility is distinct from fact. Hiding a field is a visibility decision,
  not a truth change.
- Regeneration must preserve owner intent: source change flows as
  SOURCE T2 -> OBJECT DIFF -> DEPENDENCY IMPACT -> GENERATED BASE UPDATE ->
  REAPPLY OWNER OVERRIDES -> VALIDATE -> RENDER. Never let a regenerated
  base silently drop owner overrides.
- Deterministic: same graph plus same overrides yields the same SiteSpec.
  No wall-clock, random, or locale-dependent values inside SiteSpec.

## Agent output contract

Return: QUESTION / EVIDENCE / FILES INSPECTED / CODE/HISTORY HARVESTED /
EXTERNAL MATERIAL REVIEWED / ASSUMPTIONS FALSIFIED / RECOMMENDATION /
ADOPT / ADAPT / REJECT / TEST COMMAND / RISKS / NEXT HIGHEST-LEVERAGE
ACTION. No architecture essays without evidence.
