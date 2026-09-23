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
 *                                       resolves and whose object carries a
 *                                       non-empty provenance ref (direct
 *                                       evidence).
 *   BOUND, source "object-field":      a derived binding resolving to a
 *                                       deterministic transform of a present
 *                                       object field (derived fact).
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
 *                                       field, no evidence ref, no owner
 *                                       assertion, no generator ref,
 *                                       unknown classification).
 *
 * UNBOUND factual bindings fail closed at the emission gate
 * (assertSpecBindingsVerified throws before any spec is produced) or are
 * dropped from the binding set (dropUnboundBindings): an unbound factual
 * claim is never published as fact.
 *
 * Visibility is a separate dimension and is NOT decided here; the field
 * visibility seam (field-visibility.ts) and buildRenderContext own that.
 * Determinism: pure function of (bindings, graph, ownerAssertions). No
 * clock, no randomness, no I/O, no LLM, no network.
 */

import type { OwnerFieldCorrection } from "@/lib/ping/types";
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
  return candidates.find((a) => a.value === value);
}

/**
 * Verify one factual binding against the graph and the recorded owner
 * assertions. Pure and deterministic.
 */
export function verifyBinding(
  binding: PresentationBinding,
  graph: ObjectGraph,
  ownerAssertions: readonly OwnerAssertion[] = [],
): SpecBindingVerdict {
  const base = verifyPresentationBinding(binding, graph);
  if (!base.ok) {
    return { status: "UNBOUND", binding, reason: base.reason };
  }
  const value = base.value;
  switch (binding.classification) {
    case "direct":
      // verifyPresentationBinding already required a non-empty
      // provenance ref: the object's own evidence ref backs this value.
      return { status: "BOUND", binding, source: "evidence-ref", value };
    case "derived":
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
      // verifyPresentationBinding already required a generatorRef of the
      // form name@version: explicitly marked generated presentation.
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
): SpecBindingReport {
  const verdicts = bindings.map((b) =>
    verifyBinding(b, graph, ownerAssertions),
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
): SpecBindingReport {
  const report = verifySpecBindings(bindings, graph, ownerAssertions);
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
  /** Semantic digest (FNV-1a over the canonical JSON, hex). */
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
 * Classify one binding into a render atom. Pure and deterministic.
 * Unsupported factual content classifies UNKNOWN (with the reason); the
 * emission gate refuses to publish UNKNOWN atoms.
 */
export function classifyRenderAtom(
  binding: PresentationBinding,
  graph: ObjectGraph,
  ownerAssertions: readonly OwnerAssertion[] = [],
): RenderAtom {
  const verdict = verifyBinding(binding, graph, ownerAssertions);
  if (verdict.status === "UNBOUND") {
    return unknownAtom(binding, verdict.reason);
  }
  const objects = new Map(graph.objects.map((o) => [o.id, o]));
  const obj = objects.get(binding.objectId);
  const evidenceRef = obj && obj.provenance ? obj.provenance.ref : "";
  switch (verdict.source) {
    case "evidence-ref":
      return {
        id: renderAtomId(binding, "DIRECT_EVIDENCE"),
        value: verdict.value,
        classification: "DIRECT_EVIDENCE",
        evidenceRef,
      };
    case "object-field":
      return {
        id: renderAtomId(binding, "DETERMINISTIC_DERIVATION"),
        value: verdict.value,
        classification: "DETERMINISTIC_DERIVATION",
        evidenceRef,
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
        evidenceRef,
        generatorRef: binding.generatorRef,
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
 * FNV-1a (32-bit) over UTF-16 code units, hex-encoded. Pure TypeScript,
 * no node imports: the sitespec lane stays browser-safe. Deterministic
 * across processes for the same input string.
 */
function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ("0000000" + (h >>> 0).toString(16)).slice(-8);
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
  return fnv1aHex(canonical);
}

export interface BuildVerifiedRenderModelOptions {
  /** Identifies the render semantics the model was built for. */
  rendererVersion: string;
  viewerId?: string | null;
}

/**
 * Emission gate: build the verified render model for a spec fragment's
 * factual bindings. Fail closed: any UNKNOWN atom (unsupported factual
 * content) throws BindingVerificationError before a model is produced, so
 * the renderer path can never be handed unverified factual atoms.
 *
 * Deterministic: same (bindings, graph, ownerAssertions, rendererVersion,
 * viewerId) -> same model and digest. Binding order, graph object order,
 * and assertion order never affect the output; duplicate bindings are
 * deduplicated by stable atom id.
 */
export function buildVerifiedRenderModel(
  bindings: readonly PresentationBinding[],
  graph: ObjectGraph,
  ownerAssertions: readonly OwnerAssertion[] = [],
  opts: BuildVerifiedRenderModelOptions,
): VerifiedRenderModel {
  const atoms = bindings.map((b) => classifyRenderAtom(b, graph, ownerAssertions));
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
