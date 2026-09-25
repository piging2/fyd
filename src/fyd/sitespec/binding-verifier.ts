/**
 * BindingVerifier: the factual-binding gate at the evidence/object-graph
 * projection seam.
 *
 * Law (FYD-DECISIONS-LOCKED-2026-09-22): THE RENDERER DOES NOT OWN FACTUAL
 * TRUTH. THE SITE PLANNER DOES NOT OWN FACTUAL TRUTH. THE LLM DOES NOT
 * OWN FACTUAL TRUTH. The BindingVerifier / evidence-object projection seam
 * determines what factual material is eligible for presentation.
 *
 * Pipeline position:
 *
 *   EVIDENCE -> OBJECT PROJECTION -> OWNER ASSERTIONS
 *     -> BINDING VERIFICATION (this module) -> SITE SPEC -> RENDERER
 *
 * This module is a verifier, not an authority. Given a set of factual
 * bindings (the spec fragment the projection wants to publish), the object
 * graph, and the recorded owner assertions, it returns one verdict per
 * binding:
 *
 *   BOUND, source "evidence-ref":      a direct binding whose object field
 *                                       resolves, whose object carries a
 *                                       non-empty provenance ref, and whose
 *                                       field carries no owner correction
 *                                       (direct evidence; a corrected
 *                                       field's value is the owner's, so it
 *                                       verifies via the owner-assertion
 *                                       path - LANE-CLAIM H3).
 *   BOUND, source "object-field":      a derived binding resolving to a
 *                                       deterministic transform of a present
 *                                       object field whose object carries a
 *                                       non-empty provenance ref (derived
 *                                       claim WITH input evidence -
 *                                       LANE-CLAIM H1).
 *   BOUND, source "owner-assertion":   an owner_authored binding whose value
 *                                       exactly matches a recorded owner
 *                                       assertion for that object and field
 *                                       (owner assertion). A binding merely
 *                                       LABELED owner_authored is NOT enough:
 *                                       the assertion must exist and its value
 *                                       must equal the bound value.
 *   BOUND, source "generated-presentation": a generated binding naming a
 *                                       generator (name@version): explicitly
 *                                       marked generated presentation, never
 *                                       smuggled as fact.
 *   UNBOUND:                           anything else. The verdict carries a
 *                                       reason (unknown object, unbound
 *                                       field, no evidence ref, no input
 *                                       evidence, no owner assertion, no
 *                                       generator ref, stale evidence,
 *                                       non-website provenance kind on a
 *                                       direct binding, unknown
 *                                       classification).
 *
 * UNBOUND factual bindings fail closed at the emission gate
 * (assertSpecBindingsVerified throws before any spec is produced) or are
 * dropped from the binding set (dropUnboundBindings): an unbound factual
 * claim is never published as fact.
 *
 * Visibility is a separate dimension and is NOT decided here; the field
 * visibility seam (field-visibility.ts) and buildRenderContext own that.
 * Determinism: pure function of (bindings, graph, ownerAssertions, now).
 * No randomness, no I/O, no LLM, no network; now defaults to the current
 * instant when the caller omits it, so production callers always enforce
 * the evidence-freshness rule.
 */

import type {
  ObjectProvenanceKind,
  OwnerFieldCorrection,
  PingObject,
} from "@/lib/ping/types";
import type { ObjectGraph } from "./types";
import {
  verifyPresentationBinding,
  type PresentationBinding,
} from "./graph";

/** Re-exported for emission-seam consumers (planner, renderer). */
export type { PresentationBinding } from "./graph";

/**
 * A recorded owner attestation the projection may bind owner_authored
 * statements to. In the live graph these ride on the object itself
 * (PingObject.ownerFieldCorrections, attached by the read seam); the
 * verifier takes them as an explicit input so the check is visible and
 * testable rather than implicit.
 */
export interface OwnerAssertion {
  objectId: string;
  /** "title" | "description" | a key of fields. */
  field: string;
  /** The exact value the owner attests. The bound value must equal this. */
  value: string;
}

/**
 * Derive owner assertions from a graph: the read seam attaches
 * ownerFieldCorrections to objects, each carrying the source value the
 * correction was recorded against and the owner's attested value.
 * Order follows the graph (object order, then correction order):
 * deterministic for a given graph.
 */
export function ownerAssertionsFromGraph(graph: ObjectGraph): OwnerAssertion[] {
  const out: OwnerAssertion[] = [];
  for (const o of graph.objects) {
    const corrections: OwnerFieldCorrection[] = o.ownerFieldCorrections ?? [];
    for (const c of corrections) {
      out.push({ objectId: o.id, field: c.field, value: c.ownerValue });
    }
  }
  return out;
}

/**
 * Evidence-freshness horizon (LANE-CLAIM D1). A factual binding whose
 * object provenance was derived more than this many days before the
 * reference instant is downgraded: it no longer verifies as evidence
 * (UNBOUND, reason "stale evidence"), so the atom is withheld rather
 * than published as fact. Re-ingesting the evidence refreshes derivedAt
 * and restores the binding: the rule is reversible.
 *
 * 365 days is the safest reversible default: it catches the proven
 * 20-month-stale case while leaving normal annual re-verification cycles
 * untouched. Tune by changing this constant only.
 */
export const EVIDENCE_FRESHNESS_HORIZON_DAYS = 365;

/**
 * Reference instant for the evidence-freshness rule. Deterministic when
 * supplied (tests pin it); when omitted the current instant is used at
 * the call boundary so production callers always enforce the rule.
 */
export interface VerifyBindingOptions {
  /** ISO-8601 reference instant for the evidence-freshness check. */
  now?: string;
}

function resolveNowIso(opts?: VerifyBindingOptions): string {
  return opts?.now ?? new Date().toISOString();
}

/**
 * True when the object's evidence is fresh enough to back a factual
 * claim: derivedAt is within the horizon of the reference instant. A
 * missing or unparseable derivedAt cannot be judged stale, so it is
 * treated as fresh here; the ref-presence and kind gates still apply. A
 * derivedAt in the future (clock skew) is never stale.
 */
function evidenceIsFresh(obj: PingObject | undefined, nowIso: string): boolean {
  const derivedAt = obj?.provenance?.derivedAt;
  if (!derivedAt) return true;
  const derivedMs = Date.parse(derivedAt);
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(derivedMs) || Number.isNaN(nowMs)) return true;
  const ageMs = nowMs - derivedMs;
  if (ageMs < 0) return true;
  return ageMs <= EVIDENCE_FRESHNESS_HORIZON_DAYS * 24 * 60 * 60 * 1000;
}

function staleEvidenceReason(obj: PingObject | undefined): string {
  return (
    "stale evidence: derivedAt " +
    (obj?.provenance?.derivedAt ?? "unknown") +
    " is past the " +
    EVIDENCE_FRESHNESS_HORIZON_DAYS +
    "-day freshness horizon"
  );
}

/**
 * The accepted source a BOUND verdict traces to. These are the three
 * factual sources from the locked decisions (DIRECT EVIDENCE, DERIVED
 * FACT, OWNER ASSERTION) plus the explicit generated-presentation mark
 * the directives require for anything else.
 */
export type BindingSource =
  | "object-field"
  | "owner-assertion"
  | "evidence-ref"
  | "generated-presentation";

export interface BoundBindingVerdict {
  status: "BOUND";
  binding: PresentationBinding;
  source: BindingSource;
  /** The verified value the binding resolves to. */
  value: string;
}

export interface UnboundBindingVerdict {
  status: "UNBOUND";
  binding: PresentationBinding;
  reason: string;
}

export type SpecBindingVerdict = BoundBindingVerdict | UnboundBindingVerdict;

/**
 * Deterministic owner-assertion lookup. Assertions are indexed by
 * (objectId, field) and sorted by value so the match does not depend on
 * input order: the same assertions in any order yield the same verdict.
 */
function findOwnerAssertion(
  ownerAssertions: readonly OwnerAssertion[],
  objectId: string,
  field: string,
  value: string,
): OwnerAssertion | undefined {
  const candidates = ownerAssertions
    .filter((a) => a.objectId === objectId && a.field === field)
    .sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
  // LANE-CLAIM H7: compare on trimmed values so trivial ingestion
  // whitespace cannot void a real owner assertion (false UNBOUND).
  // Trimming is not a weakening: the attested value must still match.
  const needle = value.trim();
  return candidates.find((a) => a.value.trim() === needle);
}

/**
 * Verify one factual binding against the graph and the recorded owner
 * assertions. Pure and deterministic.
 */
export function verifyBinding(
  binding: PresentationBinding,
  graph: ObjectGraph,
  ownerAssertions: readonly OwnerAssertion[] = [],
  opts: VerifyBindingOptions = {},
): SpecBindingVerdict {
  const base = verifyPresentationBinding(binding, graph);
  if (!base.ok) {
    return { status: "UNBOUND", binding, reason: base.reason };
  }
  const nowIso = resolveNowIso(opts);
  const value = base.value;
  const obj = new Map(graph.objects.map((o) => [o.id, o])).get(
    binding.objectId,
  );
  const evidenceRef = obj?.provenance?.ref ?? "";
  switch (binding.classification) {
    case "direct": {
      // LANE-CLAIM H3: an owner correction re-authors the field. The
      // presented value is the owner's, not the source's, so grading it
      // "evidence-ref" would launder owner authorship as direct evidence.
      // A corrected field verifies through the owner-assertion path; with
      // no matching assertion it is UNBOUND.
      const corrected = obj?.ownerFieldCorrections?.some(
        (c) => c.field === binding.field,
      );
      if (corrected) {
        const match = findOwnerAssertion(
          ownerAssertions,
          binding.objectId,
          binding.field,
          value,
        );
        if (!match) {
          return { status: "UNBOUND", binding, reason: "no owner assertion" };
        }
        return { status: "BOUND", binding, source: "owner-assertion", value };
      }
      // LANE-CLAIM D4: DIRECT_EVIDENCE is website evidence. An object
      // whose provenance kind is not website-derived (overlay-authored,
      // canonical-journal) can never back a direct binding: the kind's
      // own contract (src/lib/ping/types.ts) forbids classifying it as
      // the website's words. Such bindings are UNBOUND here, never
      // silently graded as direct evidence.
      const provenanceKind = obj?.provenance?.kind;
      if (provenanceKind !== "website-derived") {
        return {
          status: "UNBOUND",
          binding,
          reason:
            "provenance kind \"" +
            (provenanceKind ?? "missing") +
            "\" cannot back direct evidence",
        };
      }
      // LANE-CLAIM D1: staleness is modeled. Evidence derived past the
      // freshness horizon no longer verifies as direct evidence: the
      // binding is downgraded (UNBOUND with a named reason), never
      // silently published as DIRECT_EVIDENCE.
      if (!evidenceIsFresh(obj, nowIso)) {
        return { status: "UNBOUND", binding, reason: staleEvidenceReason(obj) };
      }
      // verifyPresentationBinding already required a non-empty
      // provenance ref: the object's own evidence ref backs this value.
      return { status: "BOUND", binding, source: "evidence-ref", value };
    }
    case "derived":
      // LANE-CLAIM H1: a derived claim must be a DERIVED CLAIM WITH INPUT
      // EVIDENCE. The object's provenance ref is the input evidence; an
      // empty ref means any label could smuggle an unevidenced fact
      // through as BOUND.
      if (evidenceRef === "") {
        return { status: "UNBOUND", binding, reason: "no input evidence" };
      }
      // LANE-CLAIM D1: the input evidence behind a derived claim is
      // subject to the same freshness horizon as direct evidence.
      if (!evidenceIsFresh(obj, nowIso)) {
        return { status: "UNBOUND", binding, reason: staleEvidenceReason(obj) };
      }
      return { status: "BOUND", binding, source: "object-field", value };
    case "owner_authored": {
      // The new enforcement: the label is not enough. A recorded owner
      // assertion for this object and field must attest exactly the
      // presented value.
      const match = findOwnerAssertion(
        ownerAssertions,
        binding.objectId,
        binding.field,
        value,
      );
      if (!match) {
        return { status: "UNBOUND", binding, reason: "no owner assertion" };
      }
      return { status: "BOUND", binding, source: "owner-assertion", value };
    }
    case "generated":
      // LANE-CLAIM H2: the builder decision requires a generator mark AND
      // an evidence ref for generated factual atoms
      // (FYD-24H-BUILDER-DECISIONS-2026-09-22, CONTENT CONTRACT). The mark
      // was checked by verifyPresentationBinding; the evidence ref is
      // enforced here so the two emission gates (assertSpecBindingsVerified
      // and buildVerifiedRenderModel) agree.
      if (evidenceRef === "") {
        return { status: "UNBOUND", binding, reason: "no evidence ref" };
      }
      // LANE-CLAIM D1: generated factual atoms bind to evidence, so the
      // freshness horizon applies here too.
      if (!evidenceIsFresh(obj, nowIso)) {
        return { status: "UNBOUND", binding, reason: staleEvidenceReason(obj) };
      }
      return {
        status: "BOUND",
        binding,
        source: "generated-presentation",
        value,
      };
    default:
      return { status: "UNBOUND", binding, reason: "unknown classification" };
  }
}

/**
 * Render-seam field resolution through the STRONG verifier (LANE-CLAIM
 * H4/R-H4 reconciliation). This is the publish-path counterpart of
 * verifyBinding: the renderer's boundField/boundTitle/boundDescription
 * resolve through here, so owner_authored bindings require a recorded
 * owner assertion, exactly as the planner's emission seam enforces.
 * Returns undefined when the binding does not verify; the caller must
 * OMIT the value, never guess.
 *
 * graph.ts resolveBoundField remains the low-level resolution primitive
 * (no publish-verdict authority); new publish paths must use this seam.
 */
export function resolveBoundFieldVerified(
  graph: ObjectGraph,
  binding: PresentationBinding,
  ownerAssertions: readonly OwnerAssertion[] = [],
  opts: VerifyBindingOptions = {},
): string | undefined {
  const verdict = verifyBinding(binding, graph, ownerAssertions, opts);
  return verdict.status === "BOUND" ? verdict.value : undefined;
}

/** One verdict per input binding, in input order, plus the split. */
export interface SpecBindingReport {
  verdicts: SpecBindingVerdict[];
  bound: BoundBindingVerdict[];
  unbound: UnboundBindingVerdict[];
  allBound: boolean;
}

/**
 * Verify the emitted factual bindings of one spec fragment (or whole
 * spec) against the graph and owner assertions. The caller supplies the
 * binding set the projection wants to publish; the verifier answers
 * which of them are eligible for presentation.
 */
export function verifySpecBindings(
  bindings: readonly PresentationBinding[],
  graph: ObjectGraph,
  ownerAssertions: readonly OwnerAssertion[] = [],
  opts: VerifyBindingOptions = {},
): SpecBindingReport {
  const verdicts = bindings.map((b) =>
    verifyBinding(b, graph, ownerAssertions, opts),
  );
  const bound = verdicts.filter(
    (v): v is BoundBindingVerdict => v.status === "BOUND",
  );
  const unbound = verdicts.filter(
    (v): v is UnboundBindingVerdict => v.status === "UNBOUND",
  );
  return { verdicts, bound, unbound, allBound: unbound.length === 0 };
}

/** Fail-closed error: a spec with unbound factual claims must never exist. */
export class BindingVerificationError extends Error {
  readonly report: SpecBindingReport;
  constructor(report: SpecBindingReport) {
    const first = report.unbound[0];
    const where = first
      ? first.binding.objectId + "#" + first.binding.field
      : "?";
    super(
      "Binding verification refused " +
        report.unbound.length +
        " of " +
        report.verdicts.length +
        " factual bindings (" +
        (first ? first.reason : "unknown") +
        " on " +
        where +
        "). No spec may be emitted with unbound factual claims.",
    );
    this.name = "BindingVerificationError";
    this.report = report;
  }
}

/**
 * Emission gate: verify the spec fragment's factual bindings and fail
 * closed. The projection path (planner) calls this before producing a
 * spec, so the renderer path cannot be handed an unverified spec.
 * Returns the report for the caller to record.
 */
export function assertSpecBindingsVerified(
  bindings: readonly PresentationBinding[],
  graph: ObjectGraph,
  ownerAssertions: readonly OwnerAssertion[] = [],
  opts: VerifyBindingOptions = {},
): SpecBindingReport {
  const report = verifySpecBindings(bindings, graph, ownerAssertions, opts);
  if (!report.allBound) {
    throw new BindingVerificationError(report);
  }
  return report;
}

/**
 * Projection-path option: keep only the BOUND bindings. The unbound
 * factual claims are dropped from what the spec publishes; what remains
 * is either bound or explicitly marked generated presentation.
 */
export function dropUnboundBindings(
  bindings: readonly PresentationBinding[],
  report: SpecBindingReport,
): PresentationBinding[] {
  const unboundSet = new Set<PresentationBinding>(
    report.unbound.map((v) => v.binding),
  );
  return bindings.filter((b) => !unboundSet.has(b));
}

/* ---------------------------------------------------------------------------
 * Verified Render Model (FYD-24H-BUILDER-DECISIONS-2026-09-22: CONTENT
 * CONTRACT + TRUTH BOUNDARY).
 *
 * Required boundary:
 *
 *   EVIDENCE GRAPH -> BINDING VERIFIER -> VERIFIED RENDER MODEL
 *     -> SITE SPEC / RENDERER
 *
 * The verifier emits the verified render model; the renderer consumes only
 * that model. No claim checking happens in React components, and no
 * ClaimAuthority is created: the existing evidence/object machinery plus
 * this verifier owns the invariant.
 *
 * Render-atom classification vocabulary (exact, per the decision):
 *   OWNER_ASSERTED / DIRECT_EVIDENCE / DETERMINISTIC_DERIVATION /
 *   GENERATED_PRESENTATION / UNKNOWN
 * This is the RENDER-atom vocabulary. The ask-answer vocabulary
 * (DIRECT / DERIVED / INFERRED / OWNER_ASSERTED / CONFLICTING / UNKNOWN)
 * is owned by the ask lane; the two are never conflated. The mapping from
 * the projection's binding classifications to render atoms is:
 *   direct         -> DIRECT_EVIDENCE
 *   derived        -> DETERMINISTIC_DERIVATION
 *   owner_authored -> OWNER_ASSERTED (requires a real recorded assertion)
 *   generated      -> GENERATED_PRESENTATION (requires a generator mark AND
 *                     an evidence ref: generated factual atoms must bind to
 *                     evidence)
 * Every factual render atom carries VALUE + CLASSIFICATION + EVIDENCE_REF
 * or OWNER_ASSERTION_REF. Unsupported factual atoms classify UNKNOWN and
 * fail the emission gate: they are never published as fact.
 *
 * Determinism: the model is a pure function of (bindings, graph,
 * ownerAssertions, rendererVersion, viewerId). Atoms are sorted by stable
 * id, so input ordering never affects the model. The model carries no
 * timestamps: generatedAt and other volatile stamps belong outside the
 * semantic digest.
 * ------------------------------------------------------------------------- */

/** Version of the verified-render-model envelope. */
export const VERIFIED_RENDER_MODEL_VERSION = "fyd-verified-render-model@1";

/**
 * Render-atom classification vocabulary. Exact per the 24-hour builder
 * decisions; used for render atoms only.
 */
export type RenderAtomClassification =
  | "OWNER_ASSERTED"
  | "DIRECT_EVIDENCE"
  | "DETERMINISTIC_DERIVATION"
  | "GENERATED_PRESENTATION"
  | "UNKNOWN";

/**
 * One factual render atom: the smallest verifiable unit of published
 * factual content. VALUE + CLASSIFICATION + EVIDENCE_REF or
 * OWNER_ASSERTION_REF, per the truth boundary.
 */
export interface RenderAtom {
  /** Stable id: objectId + "#" + field + "#" + classification. */
  id: string;
  value: string;
  classification: RenderAtomClassification;
  /** The object's provenance ref. Required for every factual atom except OWNER_ASSERTED. */
  evidenceRef?: string;
  /** Stable ref to the recorded owner assertion. Required for OWNER_ASSERTED. */
  ownerAssertionRef?: string;
  /** The generator mark, carried on GENERATED_PRESENTATION atoms. */
  generatorRef?: string;
  /** Present only when classification is UNKNOWN: why the atom failed. */
  unknownReason?: string;
  /**
   * The object's provenance kind, carried on every atom (LANE-CLAIM D4).
   * Model-level rule: only "website-derived" provenance can back a
   * DIRECT_EVIDENCE atom. The kind rides the atom so the invariant is
   * checkable without re-reading the graph.
   */
  provenanceKind?: ObjectProvenanceKind;
}

/**
 * The verifier's output at the projection seam. The renderer consumes
 * only this model. digest is the semantic identity: canonical atoms +
 * rendererVersion + viewerId + envelope version. No timestamps.
 */
export interface VerifiedRenderModel {
  version: typeof VERIFIED_RENDER_MODEL_VERSION;
  rendererVersion: string;
  viewerId: string | null;
  /** Canonical order: sorted by atom id. */
  atoms: RenderAtom[];
  /**
   * Semantic digest (SHA-256 over the canonical JSON, hex). LANE-CLAIM H8:
   * collision-resistant, so it can back change detection and dedup.
   */
  digest: string;
}

/**
 * Stable owner-assertion ref for an atom: traceable back to the object
 * and field the owner attested, without embedding store internals.
 */
export function ownerAssertionRefFor(assertion: OwnerAssertion): string {
  return "owner-assertion:" + assertion.objectId + "#" + assertion.field;
}

function renderAtomId(
  binding: PresentationBinding,
  classification: RenderAtomClassification,
): string {
  return binding.objectId + "#" + binding.field + "#" + classification;
}

function unknownAtom(
  binding: PresentationBinding,
  reason: string,
): RenderAtom {
  return {
    id: renderAtomId(binding, "UNKNOWN"),
    value: "",
    classification: "UNKNOWN",
    unknownReason: reason,
  };
}

/**
 * The object's authoritative evidence-ref lineage (LANE-CLAIM D1/D3):
 * the provenance ref plus every later update ref. The claim gate reads
 * updatedRefs so supersession is modeled: a carrier pinned to an older
 * ref in this lineage cites superseded evidence.
 */
function evidenceRefLineage(obj: PingObject | undefined): string[] {
  if (!obj?.provenance) return [];
  const lineage = [obj.provenance.ref];
  for (const r of obj.provenance.updatedRefs ?? []) {
    if (!lineage.includes(r)) lineage.push(r);
  }
  return lineage;
}

/**
 * The object's current evidence ref: the latest update ref when the
 * object has been updated, else the base provenance ref.
 */
function currentEvidenceRef(obj: PingObject | undefined): string {
  let current = obj?.provenance?.ref ?? "";
  for (const r of obj?.provenance?.updatedRefs ?? []) current = r;
  return current;
}

/**
 * Classify one binding into a render atom. Pure and deterministic.
 * Unsupported factual content classifies UNKNOWN (with the reason); the
 * emission gate refuses to publish UNKNOWN atoms.
 */
export function classifyRenderAtom(
  binding: PresentationBinding,
  graph: ObjectGraph,
  ownerAssertions: readonly OwnerAssertion[] = [],
  opts: VerifyBindingOptions = {},
): RenderAtom {
  const verdict = verifyBinding(binding, graph, ownerAssertions, opts);
  const objects = new Map(graph.objects.map((o) => [o.id, o]));
  const obj = objects.get(binding.objectId);
  // LANE-CLAIM D4: the provenance kind rides every atom, including
  // UNKNOWN ones, so the model-level invariant stays checkable.
  const provenanceKind = obj?.provenance?.kind;
  if (verdict.status === "UNBOUND") {
    return { ...unknownAtom(binding, verdict.reason), provenanceKind };
  }
  const evidenceRef = obj && obj.provenance ? obj.provenance.ref : "";
  // LANE-CLAIM H5 + D3: a binding may carry its own per-field evidence
  // ref (the planner's slot claimRef, pre-checked against the object's
  // ref by assertGeneratedPresentationVerified). The carrier is honored
  // ONLY when it names evidence the object actually carries: it must be
  // a member of the object's authoritative ref lineage
  // (provenance.ref plus provenance.updatedRefs). A carrier outside the
  // lineage is refused outright, mirroring the slot path's claim-mismatch
  // refusal; a carrier inside the lineage but superseded by later
  // updates (LANE-CLAIM D1) is refused as well. Never silently
  // substituted.
  const carrier = binding.evidenceRef;
  if (carrier !== undefined) {
    const lineage = evidenceRefLineage(obj);
    if (!lineage.includes(carrier)) {
      return {
        ...unknownAtom(
          binding,
          "carrier evidence ref is not in the object's ref lineage",
        ),
        provenanceKind,
      };
    }
    if (carrier !== currentEvidenceRef(obj)) {
      return {
        ...unknownAtom(
          binding,
          "carrier evidence ref is superseded by later object updates",
        ),
        provenanceKind,
      };
    }
  }
  const reportedRef = carrier ?? evidenceRef;
  switch (verdict.source) {
    case "evidence-ref": {
      // LANE-CLAIM D4, model level: no DIRECT_EVIDENCE atom may carry a
      // non-website-derived provenance kind. verifyBinding already
      // refuses these; this guard keeps the invariant at the model even
      // if the verdict path is ever bypassed.
      if (provenanceKind !== "website-derived") {
        return {
          ...unknownAtom(
            binding,
            "provenance kind \"" +
              (provenanceKind ?? "missing") +
              "\" cannot back DIRECT_EVIDENCE",
          ),
          provenanceKind,
        };
      }
      return {
        id: renderAtomId(binding, "DIRECT_EVIDENCE"),
        value: verdict.value,
        classification: "DIRECT_EVIDENCE",
        evidenceRef: reportedRef,
        provenanceKind,
      };
    }
    case "object-field":
      return {
        id: renderAtomId(binding, "DETERMINISTIC_DERIVATION"),
        value: verdict.value,
        classification: "DETERMINISTIC_DERIVATION",
        evidenceRef: reportedRef,
        provenanceKind,
      };
    case "owner-assertion": {
      const match = findOwnerAssertion(
        ownerAssertions,
        binding.objectId,
        binding.field,
        verdict.value,
      );
      // verifyBinding already required the match; recompute for the ref.
      return {
        id: renderAtomId(binding, "OWNER_ASSERTED"),
        value: verdict.value,
        classification: "OWNER_ASSERTED",
        ownerAssertionRef: match ? ownerAssertionRefFor(match) : undefined,
        provenanceKind,
      };
    }
    case "generated-presentation": {
      // Builder decision: generated factual atoms must bind to evidence.
      if (evidenceRef === "") {
        return unknownAtom(binding, "no evidence ref");
      }
      return {
        id: renderAtomId(binding, "GENERATED_PRESENTATION"),
        value: verdict.value,
        classification: "GENERATED_PRESENTATION",
        evidenceRef: reportedRef,
        generatorRef: binding.generatorRef,
        provenanceKind,
      };
    }
    default:
      return unknownAtom(binding, "unknown classification");
  }
}

/** Recursively sort object keys for canonical JSON. Arrays keep order. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * SHA-256 over a UTF-8 string, hex-encoded. Pure TypeScript, no node
 * imports: the sitespec lane stays browser-safe. Deterministic across
 * processes for the same input.
 *
 * LANE-CLAIM H8: the digest is the model's semantic identity. A 32-bit
 * FNV-1a collides on demand (birthday bound ~2^16 trials), so it cannot
 * back change detection or dedup. SHA-256 makes collisions
 * cryptographically infeasible while keeping the lane dependency-free.
 */
function sha256Hex(input: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const paddedLen = (((bytes.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(paddedLen - 4, bitLen >>> 0);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getUint32(off + i * 4);
    }
    for (let i = 16; i < 64; i++) {
      const s0 =
        rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((x) => ("00000000" + (x >>> 0).toString(16)).slice(-8))
    .join("");
}

/** Semantic digest input: canonical atoms + envelope version + renderer version + viewer. No timestamps. */
function digestModel(
  atoms: RenderAtom[],
  rendererVersion: string,
  viewerId: string | null,
): string {
  const canonical = JSON.stringify(
    sortKeys({
      version: VERIFIED_RENDER_MODEL_VERSION,
      rendererVersion,
      viewerId,
      atoms,
    }),
  );
  return sha256Hex(canonical);
}

export interface BuildVerifiedRenderModelOptions {
  /** Identifies the render semantics the model was built for. */
  rendererVersion: string;
  viewerId?: string | null;
  /**
   * Reference instant (ISO-8601) for the evidence-freshness rule.
   * Defaults to the current instant; tests pin it for determinism.
   */
  now?: string;
}

/**
 * Emission gate: build the verified render model for a spec fragment's
 * factual bindings. Fail closed: any UNKNOWN atom (unsupported factual
 * content) throws BindingVerificationError before a model is produced, so
 * the renderer path can never be handed unverified factual atoms.
 *
 * Deterministic: same (bindings, graph, ownerAssertions, rendererVersion,
 * viewerId, now) -> same model and digest. Binding order, graph object order,
 * and assertion order never affect the output; duplicate bindings are
 * deduplicated by stable atom id.
 */
export function buildVerifiedRenderModel(
  bindings: readonly PresentationBinding[],
  graph: ObjectGraph,
  ownerAssertions: readonly OwnerAssertion[] = [],
  opts: BuildVerifiedRenderModelOptions,
): VerifiedRenderModel {
  const atoms = bindings.map((b) =>
    classifyRenderAtom(b, graph, ownerAssertions, { now: opts.now }),
  );
  const unknown = atoms.filter((a) => a.classification === "UNKNOWN");
  if (unknown.length > 0) {
    throw new BindingVerificationError(
      verifySpecBindings(bindings, graph, ownerAssertions),
    );
  }
  const seen = new Set<string>();
  const unique: RenderAtom[] = [];
  for (const atom of atoms) {
    if (seen.has(atom.id)) continue;
    seen.add(atom.id);
    unique.push(atom);
  }
  unique.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const viewerId = opts.viewerId ?? null;
  return {
    version: VERIFIED_RENDER_MODEL_VERSION,
    rendererVersion: opts.rendererVersion,
    viewerId,
    atoms: unique,
    digest: digestModel(unique, opts.rendererVersion, viewerId),
  };
}
