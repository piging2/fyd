/**
 * FYD builder: the compiler core.
 *
 * Two halves, one boundary:
 *
 *  OBJECT BUILDER (object-builder.ts) decides WHAT IS KNOWN. Input:
 *  tenant context + current graph (projection seam) + schema catalog.
 *  Output: a verified, attested ObjectGraph. The deterministic verifier
 *  checks tenant, schema, evidence references, IDs, relationship legality,
 *  and visibility, then commits through the canonical transition path
 *  (projection-seam -> verify -> plan). NEVER arbitrary DB writes.
 *
 *  WEBSITE BUILDER (planner.ts) decides HOW known things are presented.
 *  Input: verified graph + owner overrides (already composed by the seam)
 *  + OwnerIntent + eight-dimension archetype vector + design tokens.
 *  Output: SiteSpec + DependencyManifest + GeneratedPresentation +
 *  confidence records + semantic digest. THE SITE PLANNER NEVER
 *  MANUFACTURES BUSINESS FACTS.
 *
 * CONSUMPTION CONTRACT (for the next lane: semantic diff engine +
 * owner patch loop + Ask FYD wiring):
 *
 *  - planSite({ ctx, graph, vector, ownerIntent?, designTokens?,
 *    generatedAt?, attestation? }) -> PlannedSite. ctx is a TenantContext
 *    ({ tenantId }); tenantId === siteId today. The graph MUST come from
 *    verifyObjectGraph (object-builder attestation); planSite trusts the
 *    graph bytes but re-asserts the tenant context.
 *  - PlannedSite.spec is a valid FYDSiteSpec (validate with
 *    validateSiteSpec from ../sitespec/validator before serving).
 *  - PlannedSite.manifest is the WHY THIS record: forwardWalk(manifest,
 *    sectionId) for Explain; reverseWalk(manifest, objectId|claimRef) for
 *    change impact. The semantic diff engine should diff manifests, not
 *    just specs.
 *  - PlannedSite.semanticDigest is the semantic identity: same inputs ->
 *    same digest. The owner patch loop must re-plan after every patch and
 *    compare digests to prove the patch took effect deterministically.
 *  - OwnerIntent.prohibitedPositioning and .operatingConstraints are
 *    HONORED by the planner (verified copy, component removal). The patch
 *    loop writes OwnerIntent through the owner store, never by editing a
 *    planned spec.
 *  - Ask FYD wiring: answerAskFyd stays siteId-keyed; the tenant boundary
 *    lives at the entry point (see ../tenant/scoped-stores.ts:
 *    scopedAnswerAskFyd). Never hand the answerer a bundle from another
 *    tenant's context.
 *  - Confidence law: presentationConfidence <= factConfidence is asserted
 *    inside planSite; consumers can rely on it without re-checking.
 */

export { SITE_PLANNER_VERSION, planSite } from "./planner";
export type { SitePlannerInput, PlannedSite } from "./planner";
export {
  OBJECT_BUILDER_VERSION,
  SCHEMA_CATALOG_VERSION,
  ObjectBuilderError,
  proposeObjectDelta,
  verifyObjectGraph,
} from "./object-builder";
export type {
  GraphAttestation,
  ObjectBuilderCode,
  ObjectDelta,
  VerifiedGraph,
} from "./object-builder";
export {
  ARCHETYPE_DIMENSIONS,
  COPPERSMITH_VECTOR,
  NAMED_PRESET_VECTORS,
  PING_DOGFOOD_VECTOR,
  nearestPresetName,
  policyForVector,
  quantizeVector,
  validateVector,
} from "./dimensions";
export type { ArchetypeDimension, ArchetypeVector, CompositionPolicy } from "./dimensions";
export { EXTERNAL_IDENTITY_SCHEMA, deriveEligibility } from "./eligibility";
export type { EligibilityCounts, EligibilityReport } from "./eligibility";
export {
  EMPTY_OWNER_INTENT,
  OPERATING_CONSTRAINT_COMPONENTS,
  normalizeOwnerIntent,
  resolveOperatingConstraints,
} from "./owner-intent";
export type { ConstraintResolution, OwnerIntent } from "./owner-intent";
export {
  assertConfidenceLaw,
  confidenceForBinding,
  factConfidenceForObject,
  presentationConfidenceFor,
} from "./confidence";
export type { ConfidenceRecord, PresentationKind } from "./confidence";
export {
  bindingsForComponent,
  emptyManifest,
  forwardWalk,
  reverseWalk,
} from "./manifest";
export type { BindingManifest, DependencyManifest } from "./manifest";
export {
  assertGeneratedPresentationVerified,
  verifyGeneratedPresentation,
} from "./generated-presentation";
export type {
  CopyBinding,
  GeneratedCopySlot,
  GeneratedPresentation,
  GeneratedPresentationFinding,
} from "./generated-presentation";
export { assertNoPrivateLeak, publicObjects } from "./visibility";
export { canonicalizeSpec, semanticDigestOf } from "./canonical";
export { diffSiteSpecs, renderStructuralDiffReport } from "./structural-diff";
export type { PageSectionDiff, StructuralDiff } from "./structural-diff";
