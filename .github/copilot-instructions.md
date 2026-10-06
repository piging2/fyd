# PING FYD - repository instructions for Copilot coding agents

## What this repo is

PING's FYD builder turns an evidence-backed business object graph into a live
website. Product loop, in order:

URL -> acquire -> evidence -> object graph -> SiteSpec -> render ->
Circle/Node -> Ask FYD -> owner customization -> approval -> regeneration.

The object is the asset. The website, Circle, Node, feed, search, and any
future social or sponsored surface are projections of the same canonical
object. Work that shortens or validates this loop wins; anything else is
subordinate.

## Constitutional invariants (never violate)

- One canonical read model feeds Page, Circle, ObjectView, Ask FYD, search,
  agents, and future projections.
- Layer 1 is truth: objects, relationships, evidence, owner corrections.
  Layer 2 is experience spec: SiteSpec (pages, sections, bindings, tokens,
  visibility, featured objects). Layer 3 is deterministic rendering.
  Changing typography must not rewrite business truth. Changing truth must
  not destroy owner layout. Changing renderer implementation must not mutate
  SiteSpec.
- No invented claims, objects, relationships, media, ownership, or facts.
  Every factual rendered value binds to an OBJECT FIELD, an
  EVIDENCE-BACKED DERIVATION, OWNER AUTHORED COPY, or EXPLICITLY LABELED
  GENERATED PRESENTATION COPY. Copy classes: DIRECT / DERIVED /
  GENERATED PRESENTATION / OWNER COPY. Sparse evidence means fewer
  projections, never padding.
- Intelligence produces typed data (SitePatch, AnswerWithEvidence). It never
  produces arbitrary JSX. The renderer is a pure deterministic projection.
- Structured patches only: add/remove/move section, change variant/binding,
  feature object, change token, change owner copy. No arbitrary filesystem
  mutation.
- Tenant isolation: every tenant-owned read/write requires a trusted
  TenantContext (src/fyd/tenant/tenant-context.ts). URLs and request bodies
  cannot override tenant identity. Cross-tenant access fails closed.
- Ask FYD answers are SUPPORTED, labeled DERIVED, or UNKNOWN. If evidence
  cannot support an answer, say so. That honesty is a feature. No general
  web research in the Ask path.

## How to work here

- Harvest before writing. Search PING code, git history, and the ecosystem
  before writing new code. Reuse the existing media, object, tenant, and ask
  machinery. Check src/fyd/TEST-GATE.md and nearby lane docs first. The
  harvest question is: what hard problem did they already solve that we
  should not solve again.
- Canonical test gate: src/fyd/TEST-GATE.md defines the exact commands.
  TypeScript must be clean (npx tsc --noEmit) and every lane's jest suite
  runs from its committed jest.config.cjs, e.g.
  npx jest --config src/fyd/ask/jest.config.cjs. Every new suite ships its
  own committed config. The gate runs from a clean worktree at a known SHA;
  prose does not outrank reproducible execution. From this sandbox, run repo
  commands on the Pig via ~/workspace/pig/pigwsl-run.sh '<cmd>' with workdir
  /home/nolan/projects/ping.
- Git: small coherent commits, explicit staged paths, inspect the staged
  diff before committing. Never force push, never rewrite shared history,
  never push without explicit authorization. Never git add -A.
- Security: never write secrets, tokens, private keys, or customer-private
  evidence into the repo. Treat hostile URLs and user content as untrusted.
  Fail closed: UNKNOWN or an honest error, never fixture fallback.
- Owner mode is explicit DEMO OWNER MODE: visibly labeled, tenant-scoped to
  the two demo tenants (happy-place, coppersmith-plumbing). One
  ViewerContext/OwnerContext boundary (src/fyd/owner-mode/). No scattered
  demo-owner conditionals. Every mutation uses proposal/transition semantics
  with digest binding (tenant + actor + base digest + patch digest +
  approval + result digest). A changed base yields STALE PROPOSAL.
- Performance is a hard engineering budget, never an excuse for a worse
  product.

## Agent output contract

Every agent task returns: QUESTION / EVIDENCE / FILES INSPECTED /
CODE/HISTORY HARVESTED / EXTERNAL MATERIAL REVIEWED /
ASSUMPTIONS FALSIFIED / RECOMMENDATION / ADOPT / ADAPT / REJECT /
TEST COMMAND / RISKS / NEXT HIGHEST-LEVERAGE ACTION.
No architecture essays without evidence.
