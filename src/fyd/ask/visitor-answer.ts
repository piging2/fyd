/**
 * Visitor Ask FYD answer pipeline (server-only, framework-free).
 *
 * This module owns the HTTP-independent core of POST /api/fyd/ask: load the
 * site bundle, project the graph to PUBLIC objects/relationships only, build
 * the AskFydContext with an anonymous viewer and visitor-safe grants, run the
 * existing deterministic composeAskFyd pipeline, and return the answer with
 * visitor-facing citations.
 *
 * Visibility contract:
 * - Only objects with visibility "public" enter the context.
 * - Only active relationships whose subject and object are both public.
 * - Owner field-visibility decisions apply first (conservative defaults when
 *   the owner has not decided): an address-bearing field is coarsened, never
 *   leaked verbatim. A HIDE on a semantic address fact yields zero
 *   disclosure, including via graph traversal (FYD-Q2).
 * - Declared unresolved field conflicts suppress the contested value; the
 *   answer describes the field as being verified, never selecting a
 *   disputed value (FYD-Q1).
 * - The viewer is anonymous ({ id: null }) with no grants: no proposal,
 *   draft, or mutation capability exists in this pipeline.
 * - mode "owner" is accepted for a future authenticated lane, but until that
 *   lane exists it is treated as visitor-safe: it grants nothing and changes
 *   nothing. This module never claims owner capabilities it does not have.
 *
 * Evidence contract: never invent business facts. When the composed answer
 * cites no evidence, the outcome is a refusal (ok: true, refusal: true) with
 * visitor-facing wording, not a guess. A projection that cannot be loaded or
 * verified is the same honest unknown (projection_unavailable), never an
 * exception-shaped hole.
 *
 * 5-class contract (Ask FYD support classes): every citation carries a
 * claimClass ("SUPPORTED DIRECTLY" | "DERIVED" | "CONFLICTED") and the route
 * layer reduces the answer to exactly one of
 * "SUPPORTED DIRECTLY" | "SUPPORTED BY MULTIPLE EVIDENCE" | "DERIVED" |
 * "CONFLICTED" | "UNSUPPORTED". "SUPPORTED BY MULTIPLE EVIDENCE" requires at
 * least two distinct SUPPORTED DIRECTLY citations standing behind the SAME
 * claim (multiple evidence references for one claim), not merely several
 * unrelated facts in the answer. A conflict observation cite is always
 * "CONFLICTED": the answer surfaces the disagreement instead of selecting a
 * disputed value. "UNSUPPORTED" = refusal, no cited evidence.
 * DERIVED_FACT, INFERENCE, and GENERATED_COPY claims are always labeled
 * "DERIVED": generated presentation must never introduce an unsupported
 * factual predicate as a plain fact.
 *
 * Coarse states (both layers): the five support classes feed exactly three
 * coarse answer states: KNOWN (SUPPORTED DIRECTLY, SUPPORTED BY MULTIPLE
 * EVIDENCE, DERIVED), CONFLICTED (CONFLICTED), UNKNOWN (UNSUPPORTED).
 * answerStateFor is the only mapping; both layers are always present on the
 * response.
 */
import { createHash } from "node:crypto";
import type { SiteBundle } from "../media/site-bundle";
import { buildAskFydContext } from "./context-builder";
import { composeAskFyd } from "./answer";
import { canonicalize, stripInternalIds } from "../../lib/ping/ask-composer";
import { type FieldVisibilityDecision } from "../sitespec/field-visibility";
import { projectAskContextForViewer } from "./context-projection";
import {
  type AskFieldConflict,
  isUnresolvedConflict,
  parseConflictObservationRefId,
} from "./field-conflicts";
import { resolveQuery } from "../components/renderer";
import { selectRelatedCircles } from "../object/related";
import type { SiteSpecSummary } from "./site-spec";
import type {
  AskClaimClassification,
  AskProposal,
  AskEvidenceRef,
  PlannedAction,
  PingObject,
  PingRelationship,
} from "../../lib/ping/types";
/** Re-exported for the route layer's 5-class reduction (ask-pipeline). */
export type { AskClaimClassification };
import type { FYDSiteSpec, FYDPage, ObjectGraph } from "../sitespec/types";

export type AskFydMode = "visitor" | "owner";

/**
 * Per-citation epistemic class for the Ask FYD 5-class contract.
 * - "SUPPORTED DIRECTLY": the claim is backed by cited evidence from the
 *   site data: a recorded fact, a recorded relationship, an owner-set value,
 *   owner-authored content, or the site's own statement, each attributed
 *   to its source in the citation.
 * - "DERIVED": the claim was derived, inferred, or generated from site
 *   data (DERIVED_FACT, INFERENCE, GENERATED_COPY). Always labeled as
 *   such; never presented as a verified fact.
 * - "CONFLICTED": the citation evidences a source disagreement (a conflict
 *   observation). The answer surfaces the disagreement; the disputed value
 *   is never selected.
 */
export type AskClaimClass = "SUPPORTED DIRECTLY" | "DERIVED" | "CONFLICTED";

/**
 * Answer-level support class: exactly one of the five locked values.
 * - "SUPPORTED DIRECTLY": one direct citation stands behind the answer.
 * - "SUPPORTED BY MULTIPLE EVIDENCE": at least two distinct SUPPORTED
 *   DIRECTLY citations stand behind the SAME claim. Not merely several
 *   unrelated facts in one answer.
 * - "DERIVED": any cited claim is derived/inferred/generated.
 * - "CONFLICTED": any cited claim evidences a source disagreement.
 * - "UNSUPPORTED": no cited evidence (refusal). The answer is honest
 *   unknown; it never fills the gap from model priors.
 */
export type AskAnswerClass =
  | "SUPPORTED DIRECTLY"
  | "SUPPORTED BY MULTIPLE EVIDENCE"
  | "DERIVED"
  | "CONFLICTED"
  | "UNSUPPORTED";

/**
 * Coarse answer state, fed by the five support classes (both layers).
 * KNOWN = SUPPORTED DIRECTLY | SUPPORTED BY MULTIPLE EVIDENCE | DERIVED;
 * CONFLICTED = CONFLICTED; UNKNOWN = UNSUPPORTED. Both layers are always
 * present on the response; neither may be inferred from the other by a
 * consumer guessing.
 */
export type AskAnswerState = "KNOWN" | "CONFLICTED" | "UNKNOWN";

/** The only mapping from fine support class to coarse state. */
export function answerStateFor(answerClass: AskAnswerClass): AskAnswerState {
  switch (answerClass) {
    case "CONFLICTED":
      return "CONFLICTED";
    case "UNSUPPORTED":
      return "UNKNOWN";
    default:
      return "KNOWN";
  }
}

/**
 * Map an AskClaimClassification classification string onto the 5-class
 * contract. Unrecognized or missing classifications land on
 * "SUPPORTED DIRECTLY" because the citation still names real evidence (the
 * basis text stays neutral, "Site record"); only derivation/inference/
 * generation land on "DERIVED", and only an explicit conflict
 * classification lands on "CONFLICTED".
 */
export function claimClassFor(classification: string | undefined): AskClaimClass {
  switch (classification) {
    case "DERIVED_FACT":
    case "derived":
    case "INFERENCE":
    case "GENERATED_COPY":
      return "DERIVED";
    case "CONFLICT":
    case "conflict":
      return "CONFLICTED";
    case "DEMO_SYNTHETIC":
      // Demo-operator content is evidence-backed (the journal event
      // that added it) and its source is labeled in the citation:
      // "SUPPORTED DIRECTLY" with honest attribution, never a recorded fact.
      return "SUPPORTED DIRECTLY";
    default:
      return "SUPPORTED DIRECTLY";
  }
}

/**
 * PROD-9: answer-class polarity for Ask FYD responses. Distinct from the
 * 5-class support contract (answerClass/answerState), which describes the
 * EVIDENCE standing behind the answer: polarity describes what the answer
 * IS, so the UI can render it unambiguously.
 * - "ANSWER": a normal answer (cited, derived, or conflicted).
 * - "DENIAL": the pipeline refused: out of scope, no evidence, or no
 *   authority. Refusal language is direct, never evasive.
 * - "PREMISE_REJECTED": the question assumed something false and the
 *   answer states the corrected premise (e.g. "this business does not
 *   offer emergency service", "there is no owner or staff information on
 *   record"). Never a bare "I don't know".
 */
export type AskResponseClass = "ANSWER" | "DENIAL" | "PREMISE_REJECTED";

/**
 * PROD-9: refusal texts whose premise the composer corrects outright.
 * Each fragment is a verbatim substring of a composer/site-patch refusal
 * that states the corrected premise instead of merely not knowing. A
 * refusal carrying one is PREMISE_REJECTED, not a bare denial.
 */
const PREMISE_CORRECTING_REFUSAL_FRAGMENTS = [
  "there is no owner or staff information on record", // people branch
  "could not find a service matching", // site-patch reorder: named service not offered
  "is already first, so there is nothing to change", // site-patch reorder no-op
  "site spec has no sections", // site-patch: nothing to reorder
];

/**
 * PROD-9: question-named facets whose absence the composer states as an
 * explicit corrected premise (INFERENCE absence claims), not as
 * "I don't know". The claim fragment is matched against the served claim
 * label; the question must name the facet for the question's premise to
 * be about it.
 */
const PREMISE_FACETS: { words: string[]; claimFragment: string }[] = [
  { words: ["emergency"], claimFragment: "does not offer emergency service" },
];

function hasWordLower(haystack: string, word: string): boolean {
  return new RegExp("\\b" + word + "\\b").test(haystack);
}

/**
 * PROD-9: reduce one served answer to its polarity. Deterministic and
 * surface-only: it classifies what the pipeline already produced, never
 * changing the answer. Refusals default to DENIAL; a refusal whose text
 * states the corrected premise is PREMISE_REJECTED. A non-refusal answer
 * whose claims correct the question's premise (a DERIVED absence claim
 * about a question-named facet) is PREMISE_REJECTED; everything else is
 * ANSWER.
 */
export function responseClassFor(args: {
  refusal: boolean;
  question: string;
  answer: string;
  claimClassifications: AskClaimClassification[];
}): AskResponseClass {
  const { refusal, question, answer, claimClassifications } = args;
  const answerLower = answer.toLowerCase();
  if (refusal) {
    const correctsPremise = PREMISE_CORRECTING_REFUSAL_FRAGMENTS.some((f) =>
      answerLower.includes(f),
    );
    return correctsPremise ? "PREMISE_REJECTED" : "DENIAL";
  }
  const questionLower = question.toLowerCase();
  for (const facet of PREMISE_FACETS) {
    const namesFacet = facet.words.some((w) => hasWordLower(questionLower, w));
    if (!namesFacet) continue;
    const corrects = claimClassifications.some(
      (cc) =>
        claimClassFor(cc.classification) === "DERIVED" &&
        cc.claim.toLowerCase().includes(facet.claimFragment),
    );
    if (corrects) return "PREMISE_REJECTED";
  }
  return "ANSWER";
}

export interface AnswerAskFydInput {
  siteId: string;
  /**
   * Optional object-scoped ask: the PING object id the question is about.
   * The tenant is still selected by siteId alone (never crossed); the
   * object is resolved inside this tenant's public graph with the same
   * honesty gates as loadObjectViewById (unknown id or non-public object
   * -> unknown_object). Context is the 1-hop related graph around the
   * object (selectRelatedCircles restricted to directly incident edges);
   * related objects' evidence is cited as their own, never merged into
   * the target's record.
   */
  objectId?: string;
  question: string;
  mode: AskFydMode;
  /**
   * Declared unresolved field conflicts (FYD-Q1). The public projection
   * suppresses the contested value; the answer describes the field as
   * being verified. Defaults to none.
   */
  fieldConflicts?: AskFieldConflict[];
  /**
   * Owner field-visibility decisions (FYD-Q2). A HIDE on a semantic fact
   * yields zero disclosure in public answers, including via graph
   * traversal. Defaults to conservative defaults only.
   */
  fieldVisibilityDecisions?: FieldVisibilityDecision[];
}

/** Injectable seam so tests can supply a synthetic bundle. Defaults to the real loader. */
export interface AnswerAskFydDeps {
  loadBundle: (siteId: string) => SiteBundle | null;
}

/**
 * Visitor-facing citation: the cited object and field in plain language,
 * plus the source, the basis, and the last-checked date for the Why this?
 * disclosure. The n matches the [n] marker in the answer text.
 */
export interface AskFydCitation {
  n: number;
  /** Evidence ref id, carried for debugging only; the widget shows label. */
  id: string;
  label: string;
  /** The kind of evidence behind the citation (field / object / relationship). */
  kind: "field" | "object" | "relationship";
  source: string;
  basis: string;
  lastChecked: string | null;
  /** 5-class label: "SUPPORTED DIRECTLY" (cited evidence), "DERIVED" (derived / inferred / generated, explicitly labeled), "CONFLICTED" (cites a source disagreement). */
  claimClass: AskClaimClass;
}

/** Structured object reference behind an Ask FYD answer (top-level). */
export interface AskFydObjectRef {
  objectId: string;
  label: string;
  claimClass: AskClaimClass;
}

/** Structured evidence reference behind an Ask FYD answer (top-level). */
export interface AskFydEvidenceRef {
  n: number;
  id: string;
  label: string;
  kind: "field" | "object" | "relationship";
  claimClass: AskClaimClass;
}

/** Structured source reference behind an Ask FYD answer (top-level). */
export interface AskFydSourceRef {
  source: string;
  lastChecked: string | null;
}

/**
 * Build the structured top-level refs from the visitor citations. Object
 * refs are the distinct cited objects only (relationship/field cites name
 * their own evidence, never an invented object attribution); source refs
 * are the distinct sources. All derivation is deterministic and
 * citation-backed.
 */
function buildAnswerRefs(citations: AskFydCitation[]): {
  objectRefs: AskFydObjectRef[];
  evidenceRefs: AskFydEvidenceRef[];
  sourceRefs: AskFydSourceRef[];
} {
  const evidenceRefs = citations.map((c) => ({
    n: c.n,
    id: c.id,
    label: c.label,
    kind: c.kind,
    claimClass: c.claimClass,
  }));
  const seenObjects = new Map<string, AskFydObjectRef>();
  for (const c of citations) {
    if (c.kind === "object" && !seenObjects.has(c.id)) {
      seenObjects.set(c.id, { objectId: c.id, label: c.label, claimClass: c.claimClass });
    }
  }
  const seenSources = new Map<string, AskFydSourceRef>();
  for (const c of citations) {
    if (!seenSources.has(c.source)) {
      seenSources.set(c.source, { source: c.source, lastChecked: c.lastChecked });
    }
  }
  return {
    objectRefs: [...seenObjects.values()],
    evidenceRefs,
    sourceRefs: [...seenSources.values()],
  };
}

export interface AskFydSuccess {
  ok: true;
  answer: string;
  refusal: boolean;
  /** PROD-9: answer-class polarity for the UI: ANSWER | DENIAL | PREMISE_REJECTED. */
  responseClass: AskResponseClass;
  citations: AskFydCitation[];
  /** Distinct objects cited by the answer (never invented attributions). */
  objectRefs: AskFydObjectRef[];
  /** Evidence refs behind the answer, in citation order. */
  evidenceRefs: AskFydEvidenceRef[];
  /** Distinct sources cited by the answer. */
  sourceRefs: AskFydSourceRef[];
  /** What the question asked about that has no supporting evidence. */
  unknowns: string[];
  /** Internal name for the available actions the viewer may take. */
  suggestedActions: PlannedAction[];
  /** Draft only; null when the answer proposes nothing. */
  proposal: AskProposal | null;
  /** Claim groupings: which evidence refs support the same claim. */
  claimClassifications: AskClaimClassification[];
}

export type AskFydErrorKind =
  | "unknown_site"
  | "bad_question"
  | "bad_mode"
  | "bundle_invalid"
  | "projection_unavailable"
  | "unknown_object";

export interface AskFydFailure {
  ok: false;
  error: { kind: AskFydErrorKind; message: string };
}

export type AskFydOutcome = AskFydSuccess | AskFydFailure;

/**
 * Default deps: there is no default bundle loader. Ask FYD answers from the
 * graph ONLY through the injected loader, which the ask route resolves
 * through the authorized application read seam
 * (src/fyd/data/fyd-tenant-graph.ts via getSiteBundle, itself async). A
 * synchronous default cannot perform that read, so calling answerAskFyd
 * without an injected loader fails closed (projection_unavailable) instead
 * of silently reading from an unauthorized source.
 */
const DEFAULT_DEPS: AnswerAskFydDeps = {
  loadBundle: () => {
    throw new Error(
      "answerAskFyd: no bundle loader injected. The ask route must inject " +
        "a loader resolved through the authorized graph read (getSiteBundle).",
    );
  },
};
const MAX_QUESTION_CHARS = 2000;

/**
 * Project a bundle graph to what the Ask FYD model may receive for this
 * request's viewer. FYD-010: exactly one projection implementation
 * lives in ./context-projection.ts; this is a thin wrapper. The Ask
 * pipeline serves an anonymous, unverified viewer, so the viewer class
 * is always "visitor" here. The same projection also guards
 * buildAskFydContext's other caller (the lineage tracer). The input
 * graph is never mutated.
 */
function publicGraphOf(
  graph: ObjectGraph,
  decisions: FieldVisibilityDecision[],
  conflicts: AskFieldConflict[],
): ObjectGraph {
  return projectAskContextForViewer(
    graph,
    { id: null, displayName: null, verified: false },
    decisions,
    conflicts,
  ).graph;
}

/** Attribute one conflict observation to its provenance for the citation. */
function conflictObservationSource(ref: { detail?: string }): {
  source: string;
  lastChecked: string | null;
} {
  const detail = ref.detail ?? "";
  const lastChecked = /recorded (\d{4}-\d{2}-\d{2})/.exec(detail)?.[1] ?? null;
  const url = /website-ingestion:(\S+)/.exec(detail)?.[1]?.replace(/[,.]+$/, "");
  if (url) return { source: `The business website (${url})`, lastChecked };
  if (detail.includes("provenance canonical-journal"))
    return { source: "Site record (canonical journal)", lastChecked };
  if (detail.includes("provenance owner-correction") || detail.includes("provenance owner-authored"))
    return { source: "Owner correction", lastChecked };
  return { source: "Site record", lastChecked };
}

/** Build the SiteSpecSummary the ask pipeline reasons under, from the public view. */
function summarizeSpec(bundle: SiteBundle, publicGraph: ObjectGraph): SiteSpecSummary {
  const spec: FYDSiteSpec = bundle.spec;
  const page: FYDPage = spec.pages[0] ?? {
    slug: "home",
    title: bundle.businessName,
    navLabel: bundle.businessName,
    sections: [],
  };
  const sectionObjects: Record<string, string[]> = {};
  const presentation: Record<string, Record<string, string | string[] | boolean | null>> = {};
  for (const section of page.sections) {
    sectionObjects[section.id] = resolveQuery(section.query, publicGraph, spec.ownerObjectId).map(
      (o) => o.id,
    );
    presentation[section.id] = {
      heading: section.presentation.heading ?? null,
      copy: section.presentation.copy ?? null,
      featuredIds: section.presentation.featuredIds ?? null,
      hidden: section.presentation.hidden ?? null,
    };
  }
  return {
    siteId: bundle.siteId,
    pageSlug: page.slug,
    digest: createHash("sha256").update(canonicalize(spec), "utf8").digest("hex"),
    page,
    sectionObjects,
    presentation,
  };
}

/**
 * Replace internal-facing guidance in the composed answer with
 * visitor-facing wording. The evidence contract itself is untouched.
 */
function visitorizeAnswer(text: string): string {
  return text.replace(
    "Open an object to give me something concrete to answer from, or ask about what is listed below.",
    "Try asking about the business, its services, contact details, or location.",
  );
}

/**
 * PROD-4: id stripping is the canonical stripInternalIds in
 * lib/ping/ask-composer, shared by the visitor pipeline and the
 * PingObjectReader.ask path (PROD-3+4-REPAIR). It runs on EVERY
 * user-facing text surface this pipeline returns (answer, citation labels,
 * proposal notes, unknowns, error messages) before it leaves
 * answerAskFyd. Structured debugging refs (citation ids,
 * objectRefs[].objectId) are not text surfaces and stay intact for the
 * Why-this panel.
 */

/** Label map for error paths: no bundle was loaded, so no id has a title. */
const NO_ID_LABELS: ReadonlyMap<string, string> = new Map();

function basisForClassification(classification: string): string {
  switch (classification) {
    case "DIRECT_FACT":
      return "Recorded fact from the site data";
    case "DERIVED_FACT":
    case "derived":
      return "Derived from the site data";
    case "INFERENCE":
      return "Inferred from the site data";
    case "GENERATED_COPY":
      return "Site-generated copy (not verified fact)";
    case "USER_OVERRIDE":
    case "owner_override":
      return "Owner-set value";
    case "owner_authorship":
      return "Owner-authored content";
    case "DEMO_SYNTHETIC":
      return "Demo content added by the site operator (not the website's own words)";
    case "website_statement":
      return "The site's own words (website statement, not verified fact)";
    case "relationship_fact":
      return "Recorded relationship in the site data";
    default:
      return "Site record";
  }
}

function citationFor(
  n: number,
  ref: AskEvidenceRef,
  objects: Map<string, PingObject>,
  relationships: PingRelationship[],
  classification: string | undefined,
): AskFydCitation {
  let source = "Site record";
  let lastChecked: string | null = null;
  // Note: AskEvidenceRef.id IS the cited object/relationship id (there is no
  // separate objectId field on the ref).
  if (ref.kind === "field") {
    if (parseConflictObservationRefId(ref.id) !== null) {
      // FYD-Q1: a conflict observation. Both evidence chains survive in
      // the Why-this surface; the disputed value is never embedded.
      const parsed = conflictObservationSource(ref);
      source = parsed.source;
      lastChecked = parsed.lastChecked;
    } else {
      // Field-level evidence: the ref itself is the provenance. The other
      // producer of field refs is an owner field correction (the composer
      // labels it as such), so the citation names the owner as the source
      // instead of misattributing the value to the website.
      source = "Owner correction";
    }
  } else if (ref.kind === "object") {
    const obj = objects.get(ref.id);
    const prov = obj?.provenance;
    if (prov && prov.ref.startsWith("website-ingestion:")) {
      const url = prov.ref.slice("website-ingestion:".length);
      source = url ? `The business website (${url})` : "The business website";
    } else if (prov) {
      // A canonical-journal object is a recorded object in the site data,
      // not the site's own words: label it as such so the citation does
      // not blur the two epistemic sources.
      source =
        prov.kind === "canonical-journal"
          ? "Site record (canonical journal)"
          : prov.kind === "overlay-authored"
            ? "Site record (demo addition)"
            : "Site record";
    }
    lastChecked = prov?.derivedAt ? prov.derivedAt.slice(0, 10) : null;
  } else if (ref.kind === "relationship") {
    const rel = relationships.find((r) => r.id === ref.id);
    source = rel ? `Site record (${rel.predicate.replace(/_/g, " ")})` : "Site record";
    lastChecked = rel?.createdAt ? rel.createdAt.slice(0, 10) : null;
  }
  return {
    n,
    id: ref.id,
    label: ref.label,
    kind: ref.kind,
    source,
    basis: classification ? basisForClassification(classification) : "Site record",
    lastChecked,
    // A conflict-observation cite is always CONFLICTED: it evidences the
    // disagreement, never a resolved value. Otherwise the 5-class mapping.
    claimClass:
      parseConflictObservationRefId(ref.id) !== null
        ? "CONFLICTED"
        : claimClassFor(classification),
  };
}

/** Map the [n] markers in the answer text to visitor-facing citations. */
function buildCitations(
  answer: string,
  evidenceRefs: AskEvidenceRef[],
  claimClassifications: AskClaimClassification[],
  target: PingObject,
  relatedObjects: PingObject[],
  relationships: PingRelationship[],
): AskFydCitation[] {
  const seen: number[] = [];
  const marker = /\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = marker.exec(answer)) !== null) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n >= 1 && !seen.includes(n)) seen.push(n);
  }
  const objects = new Map<string, PingObject>();
  objects.set(target.id, target);
  for (const o of relatedObjects) objects.set(o.id, o);
  const out: AskFydCitation[] = [];
  for (const n of seen.sort((a, b) => a - b)) {
    const ref = evidenceRefs[n - 1];
    if (!ref) continue;
    const classification = claimClassifications.find((c) =>
      c.evidenceRefIds.includes(ref.id),
    )?.classification;
    out.push(citationFor(n, ref, objects, relationships, classification));
  }
  return out;
}

/**
 * The 1-hop related graph around one object: selectRelatedCircles walks
 * the tenant's relationships from the target, restricted here to objects
 * joined by a directly incident active edge. Ranking (predicate priority,
 * then object id) is the selector's deterministic order. Only public
 * objects can appear (the selector skips non-public targets).
 */
function oneHopRelatedObjects(
  publicGraph: ObjectGraph,
  targetId: string,
): PingObject[] {
  const oneHopIds = new Set<string>();
  for (const r of publicGraph.relationships) {
    if (r.status !== "active") continue;
    if (r.subject === targetId && r.object !== targetId) oneHopIds.add(r.object);
    else if (r.object === targetId && r.subject !== targetId) oneHopIds.add(r.subject);
  }
  const byId = new Map(publicGraph.objects.map((o) => [o.id, o]));
  const out: PingObject[] = [];
  for (const c of selectRelatedCircles(publicGraph, targetId)) {
    if (!oneHopIds.has(c.objectId)) continue;
    const obj = byId.get(c.objectId);
    if (obj) out.push(obj);
  }
  return out;
}

/**
 * Answer a visitor question about a site. Pure function of its inputs;
 * the only effect is reading the (deterministic, cached) site bundle.
 */
export function answerAskFyd(
  input: AnswerAskFydInput,
  deps: AnswerAskFydDeps = DEFAULT_DEPS,
): AskFydOutcome {
  const siteId = input.siteId.trim();
  if (input.mode !== "visitor" && input.mode !== "owner") {
    return {
      ok: false,
      error: { kind: "bad_mode", message: stripInternalIds("mode must be 'visitor' or 'owner'.", NO_ID_LABELS) },
    };
  }
  let bundle: SiteBundle | null;
  try {
    bundle = deps.loadBundle(siteId);
  } catch (err) {
    // The projection is missing, malformed, or failed verification: the read
    // model is unavailable. That is an honest unknown, never an answer, and
    // never an exception-shaped hole. Internal detail stays server-side.
    console.error(
      "answerAskFyd: projection load failed for site \"" + siteId + "\":",
      err instanceof Error ? err.message : err,
    );
    return {
      ok: false,
      error: {
        kind: "projection_unavailable",
        message: stripInternalIds(
          "I could not load this site's data, so I cannot answer your question. The answer is unknown.",
          NO_ID_LABELS,
        ),
      },
    };
  }
  if (!bundle) {
    return {
      ok: false,
      error: { kind: "unknown_site", message: stripInternalIds("Unknown site.", NO_ID_LABELS) },
    };
  }
  const question = input.question.trim();
  if (question.length === 0) {
    return { ok: false, error: { kind: "bad_question", message: stripInternalIds("Ask a question first.", NO_ID_LABELS) } };
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return {
      ok: false,
      error: {
        kind: "bad_question",
        message: stripInternalIds(
          "That question is too long. Please keep it under 2000 characters.",
          NO_ID_LABELS,
        ),
      },
    };
  }

  const publicGraph = publicGraphOf(
    bundle.graph,
    input.fieldVisibilityDecisions ?? [],
    (input.fieldConflicts ?? []).filter(isUnresolvedConflict),
  );
  const requestedObjectId =
    typeof input.objectId === "string" ? input.objectId.trim() : "";
  // Object-scoped ask: the target is one object in THIS tenant's public
  // graph. Unknown ids fail closed as unknown_object; non-public objects
  // never enter the public graph, so they fail closed the same way.
  // Cross-tenant leakage is impossible by construction: the lookup is
  // scoped to this tenant's graph (the loadObjectViewById honesty
  // contract, enforced against the bundle being answered from).
  // (const, not let: the filter closure below keeps narrowing only on an
  // immutable binding.)
  const target =
    (requestedObjectId.length > 0
      ? publicGraph.objects.find((o) => o.id === requestedObjectId)
      : publicGraph.objects.find((o) => o.id === bundle.spec.ownerObjectId)) ?? null;
  if (!target) {
    return {
      ok: false,
      error:
        requestedObjectId.length > 0
          ? {
              kind: "unknown_object",
              message: stripInternalIds("Unknown object for this site.", NO_ID_LABELS),
            }
          // The bundle has no public business object to answer from: a
          // server problem, never something to paper over with a guess.
          : {
              kind: "bundle_invalid",
              message: stripInternalIds("This site is not available right now.", NO_ID_LABELS),
            },
    };
  }
  const relatedObjects =
    requestedObjectId.length > 0
      ? oneHopRelatedObjects(publicGraph, target.id)
      : publicGraph.objects.filter((o) => o.id !== target.id);

  const ctx = buildAskFydContext({
    // The Ask route serves anonymous visitors: no verified identity
    // exists on this path, so the viewer classifies as "visitor"
    // (fail closed). Owner visibility decisions still apply.
    viewer: { id: null, displayName: null, verified: false },
    target,
    relatedObjects,
    relationships: publicGraph.relationships,
    plan: null,
    grants: [],
    siteSpec: summarizeSpec(bundle, publicGraph),
    question,
    fieldVisibilityDecisions: input.fieldVisibilityDecisions ?? [],
    fieldConflicts: (input.fieldConflicts ?? []).filter(isUnresolvedConflict),
  });
  const ans = composeAskFyd(ctx, question);
  // PROD-4: id -> title map for the strip: known ids resolve to their
  // object titles in user-facing text; anything unrecognized becomes
  // "the site record". Titles are never ids here (displayTarget / the
  // refusal path guarantee it), so the map cannot reintroduce one.
  const idLabels = new Map<string, string>();
  const titleOf = (o: { id: string; title: string }): void => {
    const t = o.title.trim();
    if (t.length > 0 && !idLabels.has(o.id)) idLabels.set(o.id, t);
  };
  titleOf(target);
  for (const o of relatedObjects) titleOf(o);
  // PROD-4: the strip runs on every user-facing text surface, on every
  // answer path (direct answers, refusals, proposals, unknowns).
  const answer = stripInternalIds(visitorizeAnswer(ans.answer), idLabels);
  const citations = buildCitations(
    answer,
    ans.evidenceRefs,
    ans.claimClassifications,
    target,
    relatedObjects,
    publicGraph.relationships,
  ).map((c) => ({ ...c, label: stripInternalIds(c.label, idLabels) }));
  // A refusal is an answer with no cited evidence: the pipeline had nothing
  // to stand on, so it says so instead of guessing.
  const refusal = ans.partial && citations.length === 0;
  const refs = buildAnswerRefs(citations);
  // Claim groupings for the 5-class reduction: which evidence refs
  // support the same claim (SUPPORTED BY MULTIPLE EVIDENCE requires
  // >=2 distinct direct refs behind ONE claim, not across claims).
  // PROD-3+4-REPAIR-R2: claim labels are user-facing text, so raw ids
  // in them are stripped like every other surface (a blank-title
  // target used to leak "<id> business profile" here). Structured
  // evidenceRefIds are not text and stay intact.
  const claimClassifications = ans.claimClassifications.map((c) => ({
    ...c,
    claim: stripInternalIds(c.claim, idLabels),
  }));
  // PROD-9: answer-class polarity, computed on exactly what the visitor
  // sees (stripped text and claim labels). Surface-only: classification
  // never changes the answer.
  const responseClass = responseClassFor({
    refusal,
    question,
    answer,
    claimClassifications,
  });
  // The composer already computed unknowns, suggestedActions, and proposal
  // on the internal AskAnswer: surface them honestly, empty/null when
  // absent, never invented.
  return {
    ok: true,
    answer,
    refusal,
    responseClass,
    citations,
    objectRefs: refs.objectRefs,
    evidenceRefs: refs.evidenceRefs,
    sourceRefs: refs.sourceRefs,
    unknowns: ans.unknowns.map((u) => stripInternalIds(u, idLabels)),
    suggestedActions: ans.suggestedActions,
    proposal: ans.proposal
      ? { ...ans.proposal, note: stripInternalIds(ans.proposal.note, idLabels) }
      : null,
    claimClassifications,
  };
}
