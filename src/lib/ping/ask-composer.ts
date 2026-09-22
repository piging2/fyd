/**
 * Ask PING: server-side bounded context builder plus a DETERMINISTIC
 * evidence-backed answer composer (Lane A).
 *
 * No LLM, no agent runtime, no new authority. The composer is a pure
 * function of (bounded context, question): same inputs always produce the
 * same answer. Every factual sentence cites evidence as [n]; when the
 * context has no supporting evidence the composer says so instead of
 * inventing facts.
 *
 * Proposal flow: the composer DRAFTS proposals only. Agents propose, they
 * cannot publish. A human approves the exact digest through the proposal
 * endpoint, which re-verifies the digest before submitting the governed
 * signed envelope as the viewer identity.
 */

import { createHash } from "node:crypto";
import { ownerCorrectionForObject } from "@/fyd/object/owner-overlay";
import type {
  AskAnswer,
  AskClaimClassification,
  AskContext,
  AskEvidenceRef,
  AskProposal,
  CapabilityPlan,
  PingObject,
  PingRelationship,
  PlannedAction,
  SitePatchProposalBody,
} from "./types";

export const ASK_LIMITS = {
  maxRelated: 8,
  maxRelationships: 20,
  maxFieldChars: 500,
  maxRelatedInAnswer: 5,
} as const;

/** Whitelisted object fields a proposal may change. Aliases map to canonical names. */
const PROPOSABLE_FIELDS: Record<string, string> = {
  bio: "description",
  description: "description",
  summary: "description",
  title: "title",
  name: "title",
  website: "website",
  url: "website",
  location: "location",
};

// ---------------------------------------------------------------------------
// Canonical JSON + digest (sha256-canonical-json-v1)
// ---------------------------------------------------------------------------

export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(rec[k])}`).join(",")}}`;
  }
  return "null";
}

export interface ObjectProposalBody {
  kind: "object_update" | "object_create";
  targetObjectId: string | null;
  schema: string;
  changes: Record<string, string>;
}

/**
 * Digest input for every AskProposal. The digest law is shared: hash the
 * canonical body only, never the digest, algorithm label, note, or
 * signature envelope.
 */
export type ProposalBody = ObjectProposalBody | SitePatchProposalBody;

export function proposalDigest(body: ProposalBody): string {
  return createHash("sha256").update(canonicalize(body), "utf8").digest("hex");
}

export function verifyProposalDigest(proposal: AskProposal): boolean {
  const body: ProposalBody =
    proposal.kind === "site_patch"
      ? {
          kind: proposal.kind,
          targetObjectId: proposal.targetObjectId,
          schema: proposal.schema,
          changes: proposal.changes,
          sitePatch: proposal.sitePatch,
        }
      : {
          kind: proposal.kind,
          targetObjectId: proposal.targetObjectId,
          schema: proposal.schema,
          changes: proposal.changes,
        };
  return proposal.digest === proposalDigest(body);
}

// ---------------------------------------------------------------------------
// Bounded context builder
// ---------------------------------------------------------------------------

export interface AskContextInput {
  viewer: { id: string | null; displayName: string | null };
  target: PingObject | null;
  relatedObjects: PingObject[];
  relationships: PingRelationship[];
  plan: CapabilityPlan | null;
  /** Optional per-object field epistemic classes (pipeline FactClass vocabulary). */
  fieldClasses?: Record<string, Record<string, string>>;
}

/** Extract deduped source URLs from object provenance refs. Deterministic. */
function provenanceSourceUrls(objects: Array<PingObject | null>): string[] {
  const urls = new Set<string>();
  for (const o of objects) {
    const ref = o?.provenance?.ref;
    if (!ref) continue;
    const m = /^website-ingestion:(https?:\/\/.+)$/.exec(ref);
    if (m) {
      urls.add(m[1]);
      continue;
    }
    const u = /https?:\/\/[^\s"']+/.exec(ref);
    if (u) urls.add(u[0]);
  }
  return [...urls].sort();
}

/**
 * Epistemic classification from object provenance, used when the context
 * carries no explicit field class and the object has no claim kind of its
 * own. Website-derived material is the site's own words (never verified
 * fact); canonical-journal objects are recorded facts in the site data;
 * owner material is owner-authored. Overlay-authored (demo) content
 * is classified DEMO_SYNTHETIC, never a recorded fact. This keeps
 * citations on a real evidence class instead of degrading to the
 * meaningless "unknown".
 */
function classificationFromProvenance(obj: PingObject): string {
  const kind = obj.provenance?.kind ?? "";
  if (kind === "overlay-authored") return "DEMO_SYNTHETIC";
  if (kind === "canonical-journal") return "DIRECT_FACT";
  if (kind === "website-derived" || kind === "website-ingestion") return "website_statement";
  if (kind === "owner") return "owner_authorship";
  return "unknown";
}

/**
 * Epistemic classification for one object field claim. Prefers the
 * pipeline FactClass vocabulary when the context carries field classes;
 * then the object's own claim kind; then the object's provenance;
 * never invents certainty.
 */
function claimClassification(
  fieldClasses: Record<string, Record<string, string>>,
  obj: PingObject,
  field: string,
): string {
  const fc = fieldClasses[obj.id]?.[field];
  if (fc) return fc;
  const ck = obj.fields["claimKind"];
  if (typeof ck === "string" && ck !== "") return ck;
  return classificationFromProvenance(obj);
}

function truncateField(value: string | string[]): string | string[] {
  const cut = (s: string) =>
    s.length > ASK_LIMITS.maxFieldChars ? s.slice(0, ASK_LIMITS.maxFieldChars) + "…" : s;
  return Array.isArray(value) ? value.map(cut) : cut(value);
}

function boundedObject(obj: PingObject): PingObject {
  const fields: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(obj.fields)) fields[k] = truncateField(v);
  return {
    ...obj,
    title: obj.title.slice(0, 200),
    description: obj.description.slice(0, 2000),
    fields,
  };
}

export function schemaLabel(schema: string): string {
  const short = schema.split(".").pop() ?? schema;
  return short.replace(/@.*$/, "").replace(/_/g, " ");
}

export function buildAskContext(input: AskContextInput): AskContext {
  const related = input.relatedObjects.slice(0, ASK_LIMITS.maxRelated).map(boundedObject);
  const relationships = input.relationships.slice(0, ASK_LIMITS.maxRelationships);
  const target = input.target ? boundedObject(input.target) : null;

  const evidenceRefs: AskEvidenceRef[] = [];
  if (target) {
    evidenceRefs.push({
      kind: "object",
      id: target.id,
      label: `${schemaLabel(target.schema)}: ${target.title || target.id}`,
      detail: `provenance ${target.provenance.kind}, ref ${target.provenance.ref}`,
    });
  }
  for (const r of relationships.slice(0, 10)) {
    evidenceRefs.push({
      kind: "relationship",
      id: r.id,
      label: `${r.subject.slice(0, 12)} ${r.predicate} ${r.object.slice(0, 12)} (${r.status})`,
      detail: `event ${r.evidenceRef}`,
    });
  }
  for (const o of related.slice(0, 5)) {
    evidenceRefs.push({
      kind: "object",
      id: o.id,
      label: `${schemaLabel(o.schema)}: ${o.title || o.id}`,
    });
  }

  return {
    viewer: input.viewer,
    target,
    schemaLabel: target ? schemaLabel(target.schema) : "none",
    relatedObjects: related,
    relationships,
    evidenceRefs,
    plan: input.plan,
    limits: { ...ASK_LIMITS, maxRelated: ASK_LIMITS.maxRelated, maxRelationships: ASK_LIMITS.maxRelationships, maxFieldChars: ASK_LIMITS.maxFieldChars },
    fieldClasses: input.fieldClasses ?? {},
    sourceUrls: provenanceSourceUrls([target, ...related]),
  };
}

// ---------------------------------------------------------------------------
// Deterministic answer composer
// ---------------------------------------------------------------------------

interface Sentence {
  text: string;
  /** 0-based indices into evidenceRefs. Empty = non-factual (allowed sparingly). */
  cites: number[];
}

function cite(text: string, cites: number[]): string {
  if (cites.length === 0) return text;
  const tags = [...new Set(cites)].map((i) => `[${i + 1}]`).join("");
  return `${text} ${tags}`;
}

/**
 * Plain-language epistemic basis for a provenance kind, used by the
 * provenance ("how do you know?") branch. The citation layer carries the
 * formal classification; this is the sentence-level wording.
 */
function provenanceBasisLabel(kind: string): string {
  if (kind === "overlay-authored")
    return "demo content added by the site operator (not the website's own words, not a recorded fact)";
  if (kind === "canonical-journal") return "a recorded fact in the site data";
  if (kind === "website-derived" || kind === "website-ingestion")
    return "the site's own words (website statement, not independently verified)";
  if (kind === "owner") return "owner-authored content";
  return "the site record";
}

function fieldOf(obj: PingObject, ...names: string[]): string | null {
  for (const n of names) {
    const v = obj.fields[n];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && v.length > 0) return v.join(", ");
  }
  return null;
}

function hasWord(q: string, ...words: string[]): boolean {
  return words.some((w) => new RegExp(`\\b${w}\\b`).test(q));
}

/**
 * Generic words carrying no topic: question scaffolding, the branches'
 * own trigger words, and business-generic nouns. Used to decide whether
 * a question names a SPECIFIC topic (e.g. "financing") that must match
 * something on record before a branch fires.
 */
const GENERIC_WORDS: ReadonlySet<string> = new Set([
  "a", "an", "the", "this", "that", "these", "those",
  "is", "are", "was", "were", "be", "been", "being",
  "do", "does", "did", "done", "doing",
  "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
  "and", "or", "but", "if", "then", "than", "so", "such",
  "of", "for", "with", "about", "into", "from", "to", "in", "on", "at", "by", "as",
  "it", "its", "they", "them", "their", "you", "your", "yours",
  "we", "our", "us", "i", "me", "my", "mine",
  "he", "him", "his", "she", "her", "hers",
  "business", "businesses", "company", "companies", "shop", "store", "firm",
  "service", "services", "offer", "offers", "offered", "offering", "offerings",
  "provide", "provides", "provided", "providing", "sell", "sells", "sold",
  "have", "has", "had", "having", "get", "gets", "getting",
  "there", "here", "any", "some", "all", "anyone", "anything",
  "can", "could", "would", "should", "will", "shall", "may", "might", "must",
  "just", "really", "please", "very", "quite",
  "tell", "know", "kinds", "kind", "types", "type", "many", "much", "more", "most",
  "list", "name", "names", "like",
]);

/**
 * Content words of the question minus generic scaffolding. Empty means
 * the question is general ("what services are offered?"); non-empty
 * means it names a specific topic ("financing") that must match the
 * record before a branch fires.
 */
function topicWords(q: string): string[] {
  const out: string[] = [];
  for (const w of q.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length > 2 && !GENERIC_WORDS.has(w) && !out.includes(w)) out.push(w);
  }
  return out;
}

/** Words describing the services on record (services field, titles, descriptions). */
function serviceVocabulary(target: PingObject, relatedServices: PingObject[]): Set<string> {
  const vocab = new Set<string>();
  const add = (text: string | null): void => {
    if (!text) return;
    for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length > 2 && !GENERIC_WORDS.has(w)) vocab.add(w);
    }
  };
  add(fieldOf(target, "services"));
  for (const o of relatedServices) {
    add(o.title);
    add(o.description);
  }
  return vocab;
}

/** Extract proposed text after "to:", a quoted string, or "to <text>". */
function extractProposedText(question: string): string | null {
  const colon = question.match(/:\s*["“]?(.+?)["”]?\s*$/);
  if (colon && colon[1].trim().length > 0) return colon[1].trim();
  const quoted = question.match(/["“](.+?)["”]/);
  if (quoted && quoted[1].trim().length > 0) return quoted[1].trim();
  const toForm = question.match(/\bto\s+(.+?)\s*$/i);
  if (toForm && toForm[1].trim().length > 0) return toForm[1].trim();
  return null;
}

function detectProposableField(question: string): string | null {
  const q = question.toLowerCase();
  for (const alias of Object.keys(PROPOSABLE_FIELDS)) {
    if (new RegExp(`\\b${alias}\\b`).test(q)) return PROPOSABLE_FIELDS[alias];
  }
  return null;
}

function baseAnswer(
  ctx: AskContext,
): Pick<
  AskAnswer,
  | "evidenceRefs"
  | "relatedObjects"
  | "suggestedActions"
  | "claimClassifications"
  | "unknowns"
  | "sourceUrls"
> {
  return {
    evidenceRefs: ctx.evidenceRefs,
    claimClassifications: [],
    unknowns: [],
    sourceUrls: ctx.sourceUrls,
    relatedObjects: ctx.relatedObjects.slice(0, ASK_LIMITS.maxRelatedInAnswer).map((o) => ({
      id: o.id,
      schema: o.schema,
      title: o.title || o.id,
    })),
    suggestedActions: (ctx.plan?.actions ?? []).filter((a) =>
      [
        "follow",
        "unfollow",
        "like",
        "unlike",
        "open",
        "open_site",
        "open_website",
        "reply",
        "propose_update",
        "propose_site_patch",
      ].includes(a.kind),
    ) as PlannedAction[],
  };
}

function noEvidenceAnswer(ctx: AskContext, question: string, unknowns: string[] = []): AskAnswer {
  const consulted =
    ctx.evidenceRefs.length > 0
      ? `I consulted: ${ctx.evidenceRefs.map((e) => e.label).join("; ")}.`
      : "The current context contains no objects or relationships to consult.";
  return {
    ...baseAnswer(ctx),
    unknowns,
    answer: [
      "I do not have evidence for that in the current context, so I will not guess.",
      consulted,
      "Open an object to give me something concrete to answer from, or ask about what is listed below.",
    ].join("\n\n"),
    proposal: null,
    partial: true,
  };
}

export function composeAnswer(ctx: AskContext, question: string): AskAnswer {
  const q = question.toLowerCase().trim();
  const target = ctx.target;
  const base = baseAnswer(ctx);

  if (!q) {
    return {
      ...base,
      answer: "Ask me about the object on this page, or open an object first and I will answer from its evidence.",
      proposal: null,
      partial: true,
    };
  }

  // -- Proposal intents -----------------------------------------------------
  const wantsUpdate = hasWord(q, "propose", "proposing", "update", "change", "edit", "fix", "correct");
  const wantsReplyDraft =
    hasWord(q, "draft", "write", "compose") && hasWord(q, "reply", "response", "comment");
  const field = detectProposableField(q);

  if (wantsReplyDraft && target && target.schema === "ping.social.post@1") {
    const text = extractProposedText(question);
    if (!ctx.viewer.id) {
      return {
        ...base,
        answer: [
          "I can draft that reply, but you need a signed-in identity first: replies are published as someone.",
          "Pick an identity, then ask me again.",
        ].join("\n\n"),
        proposal: null,
        partial: true,
      };
    }
    if (!text) {
      return {
        ...base,
        answer: [
          "Tell me what the reply should say, for example: Draft a reply to this post: Thanks for the update.",
          "I will draft it as a proposal and you approve the exact text before anything is published.",
        ].join("\n\n"),
        proposal: null,
        partial: true,
      };
    }
    const body: ProposalBody = {
      kind: "object_create",
      targetObjectId: null,
      schema: "ping.social.post@1",
      changes: { text, replyTo: target.id },
    };
    const proposal: AskProposal = {
      ...body,
      digest: proposalDigest(body),
      digestAlgorithm: "sha256-canonical-json-v1",
      note: `Approving publishes one post as ${ctx.viewer.displayName ?? "your identity"} replying to ${target.id.slice(0, 12)}. The gateway governs the write.`,
    };
    return {
      ...base,
      answer: [
        cite(`I drafted a reply to the post ${target.title || target.id.slice(0, 12)}.`, [0]),
        "Review the exact text in the proposal below. Approving publishes it as you through the governed event path. I cannot publish it myself.",
      ].join("\n\n"),
      proposal,
      partial: false,
    };
  }

  if (wantsUpdate && target && field) {
    const text = extractProposedText(question);
    const isOwner = ctx.viewer.id !== null && ctx.viewer.id === target.controllerId;
    if (!isOwner) {
      return {
        ...base,
        answer: [
          cite(`Only the controlling identity of ${target.title || target.id.slice(0, 12)} can update it.`, [0]),
          "You are not signed in as that identity, so I did not draft a proposal.",
        ].join("\n\n"),
        proposal: null,
        partial: true,
      };
    }
    if (!text) {
      return {
        ...base,
        answer: [
          `Tell me the new ${field}, for example: Propose updating the ${field} to: We now open Sundays.`,
          "I will draft it as a proposal and you approve the exact digest before anything changes.",
        ].join("\n\n"),
        proposal: null,
        partial: true,
      };
    }
    const body: ProposalBody = {
      kind: "object_update",
      targetObjectId: target.id,
      schema: target.schema,
      changes: { [field]: text },
    };
    const proposal: AskProposal = {
      ...body,
      digest: proposalDigest(body),
      digestAlgorithm: "sha256-canonical-json-v1",
      note: `Approving applies this exact change to ${target.id.slice(0, 12)} as ${ctx.viewer.displayName ?? "your identity"}. The gateway governs the write.`,
    };
    return {
      ...base,
      answer: [
        cite(`I drafted an update to the ${field} of ${target.title || target.id.slice(0, 12)}.`, [0]),
        "Review the exact change in the proposal below. Approving applies it through the governed event path. I cannot apply it myself.",
      ].join("\n\n"),
      proposal,
      partial: false,
    };
  }

  // -- Factual intents about the target -------------------------------------
  if (target) {
    const sentences: Sentence[] = [];
    const claimClassifications: AskClaimClassification[] = [];
    const title = target.title || target.id;
    const desc = target.description || fieldOf(target, "bio", "summary");

    /**
     * Push a factual sentence and bind its evidence class in one step, so
     * every cited claim carries a real classification. Deterministic:
     * same inputs, same claims, same order. `classificationOverride` lets
     * a caller name the evidence class explicitly when the field-level
     * record carries it (owner corrections); otherwise the standard
     * field-class/provenance chain decides.
     */
    const pushClaim = (
      text: string,
      cites: number[],
      claim: string,
      obj: PingObject,
      field: string,
      classificationOverride?: string,
    ): void => {
      sentences.push({ text, cites });
      const refIds: string[] = [];
      for (const i of cites) {
        const id = ctx.evidenceRefs[i]?.id;
        if (id && !refIds.includes(id)) refIds.push(id);
      }
      claimClassifications.push({
        claim,
        classification:
          classificationOverride ?? claimClassification(ctx.fieldClasses, obj, field),
        evidenceRefIds: refIds,
      });
    };

    // People questions are answerable only from Person objects. A
    // description dump names nobody, so when the site data has no person
    // records the honest answer says so explicitly instead of guessing.
    // People and association questions are answered from person records
    // and from the active relationships incident to the target. A related
    // object's evidence informs the answer but is cited as THAT object's
    // evidence, never merged into the target's record.
    if (
      hasWord(
        q,
        "person",
        "people",
        "owner",
        "owners",
        "founder",
        "founders",
        "staff",
        "team",
        "employee",
        "employees",
        "member",
        "members",
        "associated",
        "associate",
        "associates",
        "association",
        "affiliated",
        "affiliate",
        "affiliation",
        "connected",
        "linked",
      )
    ) {
      const seenIds = new Set<string>();
      const persons = [target, ...ctx.relatedObjects].filter((o) =>
        o.schema.toLowerCase().includes("person"),
      );
      for (const p of persons) {
        seenIds.add(p.id);
        const i = ctx.evidenceRefs.findIndex((e) => e.id === p.id);
        pushClaim(
          `Person on record: ${p.title || p.id}.`,
          i >= 0 ? [i] : [],
          `${p.title || p.id} is associated with ${title}`,
          p,
          "name",
        );
      }
      const incident = ctx.relationships
        .filter(
          (r) =>
            r.status === "active" &&
            (r.subject === target.id || r.object === target.id),
        )
        .map((r) => ({
          predicate: r.predicate,
          otherId: r.subject === target.id ? r.object : r.subject,
        }))
        .filter((x) => x.otherId !== target.id)
        .sort((a, b) =>
          a.predicate < b.predicate
            ? -1
            : a.predicate > b.predicate
              ? 1
              : a.otherId < b.otherId
                ? -1
                : 1,
        );
      let associations = 0;
      for (const { predicate, otherId } of incident) {
        if (seenIds.has(otherId)) continue;
        const other = ctx.relatedObjects.find((o) => o.id === otherId);
        if (!other) continue;
        const i = ctx.evidenceRefs.findIndex((e) => e.id === other.id);
        if (i < 0) continue; // every factual sentence stays cited
        seenIds.add(otherId);
        associations += 1;
        pushClaim(
          `Associated with ${title} (${predicate.replace(/_/g, " ")}): ${other.title || other.id}.`,
          [i],
          `${other.title || other.id} is associated with ${title} via ${predicate}`,
          other,
          "name",
          "relationship_fact",
        );
      }
      if (persons.length === 0 && associations === 0) {
        return {
          ...base,
          unknowns: ["people associated with this business"],
          answer: [
            `The site data contains no person records for ${title}, so I cannot answer that: there is no owner or staff information on record.`,
            "I will not guess at names, roles, or personal details that are not on record.",
          ].join("\n\n"),
          proposal: null,
          partial: true,
        };
      }
    }

    // The profile branch answers "what is this business"-style questions
    // only. It must not fire on questions about a specific attribute the
    // context cannot ground ("what is the owner blood type?"): the
    // description does not answer those, and dumping it here is filler
    // that also suppresses the refusal signal downstream.
    const titleWords = title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2);
    const namesBusiness =
      hasWord(q, "business", "company", "shop", "store", "firm", "contractor") ||
      titleWords.some((w) => hasWord(q, w));
    // Note: hasWord is an OR over its words, so "what"+"is" needs an
    // Provenance questions ("how do you know?") are identified early:
    // the services branch below must not claim them via its broad "do"
    // trigger. A provenance question is never a services question; a
    // combined question ("what services ... and how do you know?") still
    // reaches the services branch through an explicit services word.
    const asksProvenance =
      hasWord(q, "source", "sources", "sourcing", "provenance") ||
      (hasWord(q, "how") && hasWord(q, "know")) ||
      (hasWord(q, "where") && hasWord(q, "come") && hasWord(q, "from"));
    // explicit AND here: either word alone ("what services...") is not a
    // profile question.
    const asksWhatIs = hasWord(q, "what") && hasWord(q, "is");
    const profileIntent =
      hasWord(q, "who", "describe", "tell", "about", "profile") ||
      (asksWhatIs && (hasWord(q, "this", "it", "they", "you", "your") || namesBusiness));

    if (profileIntent) {
      if (desc)
        pushClaim(`${title}: ${desc}`, [0], `${title} business profile`, target, "description");
      else
        pushClaim(
          `${title} is a ${ctx.schemaLabel} with no description on record.`,
          [0],
          `${title} has no description on record`,
          target,
          "description",
        );
      const loc = fieldOf(target, "location");
      if (loc)
        pushClaim(`Location on record: ${loc}.`, [0], `${title} location`, target, "location");
      const cat = fieldOf(target, "category", "businessCategory");
      if (cat)
        pushClaim(`Category on record: ${cat}.`, [0], `${title} category`, target, "category");
    }

    // A profile question about a service object ("tell me about this
    // service") is answered from the service's own record by the profile
    // branch above, not from a service listing.
    const targetIsService = target.schema.toLowerCase().includes("service");
    const asksServices =
      hasWord(q, "service", "services", "offer", "offers", "provide") ||
      (hasWord(q, "do") && !asksProvenance);
    if (asksServices && !(targetIsService && profileIntent)) {
      const services = fieldOf(target, "services");
      const relatedServices = ctx.relatedObjects.filter((o) =>
        ["ping.social.service@1", "ping.social.product@1", "ping.social.offer@1"].includes(o.schema),
      );
      // The branch fires only with grounded content answering the
      // question: a general services question, or a named offering that
      // matches something on record. A specific topic with no match
      // ("financing") skips the branch, so the question falls through to
      // the honest fallback instead of dumping unrelated offerings.
      const topics = topicWords(q);
      const vocab = serviceVocabulary(target, relatedServices);
      const grounded = topics.length === 0 || topics.some((w) => vocab.has(w));
      if (grounded) {
        if (services)
          pushClaim(
            `Services on record: ${services}.`,
            [0],
            `${title} services field`,
            target,
            "services",
          );
        // Offers are evidence-chain nodes, not services: the answer names
        // only service/product objects. Classifications cover exactly the
        // claims the answer states.
        const named = relatedServices.filter(
          (o) => o.schema !== "ping.social.offer@1",
        );
        if (named.length > 0) {
          const evIdx = ctx.evidenceRefs.findIndex((e) => e.id === named[0].id);
          sentences.push({
            text: `Related offerings: ${named.map((o) => o.title).join("; ")}.`,
            cites: evIdx >= 0 ? [evIdx] : [],
          });
          for (const s of named) {
            const refId = ctx.evidenceRefs.find((e) => e.id === s.id)?.id;
            claimClassifications.push({
              claim: `${title} offers ${s.title}`,
              classification: claimClassification(ctx.fieldClasses, s, "name"),
              evidenceRefIds: refId ? [refId] : [],
            });
          }
        }
        if (!services && named.length === 0) {
          return noEvidenceAnswer(ctx, question, ["services offered by this business"]);
        }
      }
    }

    if (hasWord(q, "website", "contact", "email", "phone", "call", "site")) {
      const site = fieldOf(target, "website", "url", "domain");
      const email = fieldOf(target, "email");
      const phone = fieldOf(target, "phone");
      // Owner-corrected contact fields keep the SOURCE SAYS X / OWNER SAYS
      // Y distinction in the answer itself: the value stated is the
      // owner's (effective), the site's value is named, and the claim is
      // classified as an owner override. The sentence cites a dedicated
      // FIELD-level evidence ref (the correction), not the business object:
      // citing the object would let the Why-this view mislabel the number
      // as a website statement.
      const pushContactClaim = (
        label: string,
        field: "phone" | "email" | "website",
        value: string,
      ): void => {
        const correction = ownerCorrectionForObject(target, field);
        if (!correction) {
          pushClaim(`${label} on record: ${value}.`, [0], `${title} ${field}`, target, field);
          return;
        }
        const refIdx = ctx.evidenceRefs.length;
        ctx.evidenceRefs.push({
          kind: "field",
          id: `${target.id}#${field}`,
          label: `${label}: owner correction (recorded ${correction.correctedAt.slice(0, 10)})`,
          detail:
            `Owner correction by ${correction.actorLabel}: the owner says ` +
            `${correction.ownerValue}; the site lists ${correction.sourceValue ?? "nothing"}.`,
        });
        pushClaim(
          `${label} on record: ${value}. The owner corrected this ${field === "phone" ? "number" : field}; the site lists ${correction.sourceValue ?? "no " + field}.`,
          [refIdx],
          `${title} ${field}`,
          target,
          field,
          "owner_override",
        );
      };
      if (site) pushContactClaim("Website", "website", site);
      if (email) pushContactClaim("Email", "email", email);
      if (phone) pushContactClaim("Phone", "phone", phone);
      if (!site && !email && !phone) {
        pushClaim(
          `${title} lists no public contact details in the current context.`,
          [0],
          `${title} has no public contact details on record`,
          target,
          "contact",
        );
      }
    }

    if (hasWord(q, "where", "location", "address", "based")) {
      // located_at direction: the subject is the located thing, the object
      // is the location. From the target's perspective the location object
      // is either a related object (target is the subject) or the target
      // itself (target is the object). The claim cites the location
      // object's own evidence, never the target's.
      let locationObj: PingObject | null = null;
      let locationName: string | null = null;
      let locationSelf = false;
      for (const r of ctx.relationships) {
        if (r.status !== "active" || r.predicate !== "located_at") continue;
        if (r.subject === target.id && r.object !== target.id) {
          const o = ctx.relatedObjects.find((x) => x.id === r.object);
          if (o) {
            locationObj = o;
            locationName = o.title || fieldOf(o, "locality");
            break;
          }
        } else if (r.object === target.id && r.subject !== target.id) {
          locationObj = target;
          locationName = target.title || fieldOf(target, "locality");
          locationSelf = true;
          break;
        }
      }
      const locationRefIdx = locationObj
        ? ctx.evidenceRefs.findIndex((e) => e.id === locationObj!.id)
        : -1;
      if (locationObj && locationName && locationRefIdx >= 0) {
        if (locationSelf)
          pushClaim(
            `${title} is the location on record.`,
            [locationRefIdx],
            `${title} is a recorded location`,
            locationObj,
            "location",
            "relationship_fact",
          );
        else
          pushClaim(
            `${title} is listed at: ${locationName}.`,
            [locationRefIdx],
            `${title} location`,
            locationObj,
            "location",
            "relationship_fact",
          );
      } else {
        const loc = fieldOf(target, "location", "address", "city", "locality");
        if (loc)
          pushClaim(
            `${title} is listed at: ${loc}.`,
            [0],
            `${title} location`,
            target,
            "location",
          );
        else
          pushClaim(
            `No public location is on record for ${title}.`,
            [0],
            `${title} has no public location on record`,
            target,
            "location",
          );
      }
    }

    if (hasWord(q, "review", "rating", "trust", "proof", "evidence", "verif")) {
      const verified = fieldOf(target, "verified");
      pushClaim(
        verified
          ? `${title} carries an explicit verified mark.`
          : `${title} carries no verified mark in the current context.`,
        [0],
        `${title} verification status`,
        target,
        "verified",
      );
      const followers = fieldOf(target, "followerCount", "followers");
      if (followers)
        pushClaim(
          `Follower count on record: ${followers}.`,
          [0],
          `${title} follower count`,
          target,
          "followerCount",
        );
    }

    if (hasWord(q, "follow", "following")) {
      const followAction = base.suggestedActions.find((a) => a.kind === "follow" || a.kind === "unfollow");
      if (followAction) {
        sentences.push({
          text: `You can ${followAction.kind} ${title} with the ${followAction.label} button. It records a follows relationship event.`,
          cites: [],
        });
      } else {
        sentences.push({ text: "Following is not available for this object.", cites: [] });
      }
    }

    // Provenance questions ("how do you know?") are answered from the
    // target's own record: identity, stated source, derived date, and
    // epistemic basis. Every sentence cites the target's evidence. Placed
    // after the attribute branches: a question that names an attribute
    // ("what services ... and how do you know?") is governed by that
    // attribute's evidence rules first.
    if (asksProvenance) {
      const prov = target.provenance;
      const url = ctx.sourceUrls[0] ?? null;
      const when = (prov.derivedAt || target.updatedAt || "").slice(0, 10);
      pushClaim(
        `I answer from the site record for ${title} (${ctx.schemaLabel}).`,
        [0],
        `${title} record identity`,
        target,
        "provenance",
      );
      if (url)
        pushClaim(
          `The record's stated source is ${url}.`,
          [0],
          `${title} record source`,
          target,
          "provenance",
        );
      if (when)
        pushClaim(
          `The record was derived on ${when}.`,
          [0],
          `${title} record date`,
          target,
          "provenance",
        );
      pushClaim(
        `Basis: ${provenanceBasisLabel(prov.kind)}.`,
        [0],
        `${title} record basis`,
        target,
        "provenance",
      );
    }

    if (sentences.length > 0) {
      return {
        ...base,
        answer: sentences.map((s) => cite(s.text, s.cites)).join("\n\n"),
        claimClassifications,
        proposal: null,
        partial: false,
      };
    }

    // Fallback: no branch had grounded content answering the question.
    // Say so explicitly with no citations, so the visitor layer surfaces
    // a refusal. The description is deliberately not dumped here: citing
    // it would look like an answer while answering nothing.
    return noEvidenceAnswer(ctx, question);
  }

  // -- No target -------------------------------------------------------------
  if (hasWord(q, "what", "can", "you", "do", "help", "how")) {
    return {
      ...base,
      answer: [
        "I answer questions from PING evidence: objects, relationships, and provenance the BFF hands me.",
        "Open an object and I will summarize it, list its services and contact details, or draft a reply or an update as a proposal you approve.",
        "Every factual sentence I write cites its evidence. When I have none, I say so.",
      ].join("\n\n"),
      proposal: null,
      partial: false,
    };
  }
  return noEvidenceAnswer(ctx, question);
}
