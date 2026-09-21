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
 *   leaked verbatim.
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
 */
import { createHash } from "node:crypto";
import { getSiteBundle } from "../media/site-bundle";
import type { SiteBundle } from "../media/site-bundle";
import { buildAskFydContext } from "./context-builder";
import { composeAskFyd } from "./answer";
import { canonicalize } from "../../lib/ping/ask-composer";
import { applyFieldVisibility } from "../sitespec/field-visibility";
import { resolveQuery } from "../components/renderer";
import type { SiteSpecSummary } from "./site-spec";
import type {
  AskClaimClassification,
  AskEvidenceRef,
  PingObject,
  PingRelationship,
} from "../../lib/ping/types";
import type { FYDSiteSpec, FYDPage, ObjectGraph } from "../sitespec/types";

export type AskFydMode = "visitor" | "owner";

export interface AnswerAskFydInput {
  siteId: string;
  question: string;
  mode: AskFydMode;
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
  source: string;
  basis: string;
  lastChecked: string | null;
}

export interface AskFydSuccess {
  ok: true;
  answer: string;
  refusal: boolean;
  citations: AskFydCitation[];
}

export type AskFydErrorKind =
  | "unknown_site"
  | "bad_question"
  | "bad_mode"
  | "bundle_invalid"
  | "projection_unavailable";

export interface AskFydFailure {
  ok: false;
  error: { kind: AskFydErrorKind; message: string };
}

export type AskFydOutcome = AskFydSuccess | AskFydFailure;

const DEFAULT_DEPS: AnswerAskFydDeps = { loadBundle: getSiteBundle };
const MAX_QUESTION_CHARS = 2000;

/**
 * Project a bundle graph to what a visitor may see: owner field-visibility
 * decisions first (conservative defaults), then only public objects and only
 * active relationships whose subject and object are both public.
 */
function publicGraphOf(graph: ObjectGraph): ObjectGraph {
  const projected = applyFieldVisibility(graph, []);
  const publicObjects = projected.objects.filter((o) => o.visibility === "public");
  const publicIds = new Set(publicObjects.map((o) => o.id));
  const publicRelationships = projected.relationships.filter(
    (r) => r.status === "active" && publicIds.has(r.subject) && publicIds.has(r.object),
  );
  return { objects: publicObjects, relationships: publicRelationships };
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
    // Field-level evidence: the ref itself is the provenance. Today the
    // only producer of field refs is an owner field correction (the
    // composer labels it as such), so the citation names the owner as the
    // source instead of misattributing the value to the website.
    source = "Owner correction";
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
      source = prov.kind === "canonical-journal" ? "Site record (canonical journal)" : "Site record";
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
    source,
    basis: classification ? basisForClassification(classification) : "Site record",
    lastChecked,
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
      error: { kind: "bad_mode", message: "mode must be 'visitor' or 'owner'." },
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
        message:
          "I could not load this site's data, so I cannot answer your question. The answer is unknown.",
      },
    };
  }
  if (!bundle) {
    return { ok: false, error: { kind: "unknown_site", message: "Unknown site." } };
  }
  const question = input.question.trim();
  if (question.length === 0) {
    return { ok: false, error: { kind: "bad_question", message: "Ask a question first." } };
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return {
      ok: false,
      error: {
        kind: "bad_question",
        message: "That question is too long. Please keep it under 2000 characters.",
      },
    };
  }

  const publicGraph = publicGraphOf(bundle.graph);
  const target = publicGraph.objects.find((o) => o.id === bundle.spec.ownerObjectId) ?? null;
  if (!target) {
    // The bundle has no public business object to answer from: a server
    // problem, never something to paper over with a guess.
    return {
      ok: false,
      error: { kind: "bundle_invalid", message: "This site is not available right now." },
    };
  }
  const relatedObjects = publicGraph.objects.filter((o) => o.id !== target.id);

  const ctx = buildAskFydContext({
    viewer: { id: null, displayName: null },
    target,
    relatedObjects,
    relationships: publicGraph.relationships,
    plan: null,
    grants: [],
    siteSpec: summarizeSpec(bundle, publicGraph),
    question,
  });
  const ans = composeAskFyd(ctx, question);
  const answer = visitorizeAnswer(ans.answer);
  const citations = buildCitations(
    answer,
    ans.evidenceRefs,
    ans.claimClassifications,
    target,
    relatedObjects,
    publicGraph.relationships,
  );
  // A refusal is an answer with no cited evidence: the pipeline had nothing
  // to stand on, so it says so instead of guessing.
  const refusal = ans.partial && citations.length === 0;
  return { ok: true, answer, refusal, citations };
}
