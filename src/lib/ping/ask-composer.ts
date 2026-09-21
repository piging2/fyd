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
 * Epistemic classification for one object field claim. Prefers the
 * pipeline FactClass vocabulary when the context carries field classes;
 * falls back to the object's own claim kind; never invents certainty.
 */
function claimClassification(
  fieldClasses: Record<string, Record<string, string>>,
  obj: PingObject,
  field: string,
): string {
  const fc = fieldClasses[obj.id]?.[field];
  if (fc) return fc;
  const ck = obj.fields["claimKind"];
  return typeof ck === "string" && ck !== "" ? ck : "unknown";
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

    if (hasWord(q, "who", "what", "describe", "tell", "about", "is", "profile")) {
      if (desc) sentences.push({ text: `${title}: ${desc}`, cites: [0] });
      else sentences.push({ text: `${title} is a ${ctx.schemaLabel} with no description on record.`, cites: [0] });
      const loc = fieldOf(target, "location");
      if (loc) sentences.push({ text: `Location on record: ${loc}.`, cites: [0] });
      const cat = fieldOf(target, "category", "businessCategory");
      if (cat) sentences.push({ text: `Category on record: ${cat}.`, cites: [0] });
    }

    if (hasWord(q, "service", "services", "offer", "offers", "provide", "do")) {
      const services = fieldOf(target, "services");
      const relatedServices = ctx.relatedObjects.filter((o) =>
        ["ping.social.service@1", "ping.social.product@1", "ping.social.offer@1"].includes(o.schema),
      );
      if (services) sentences.push({ text: `Services on record: ${services}.`, cites: [0] });
      if (relatedServices.length > 0) {
        const evIdx = ctx.evidenceRefs.findIndex((e) => e.id === relatedServices[0].id);
        sentences.push({
          text: `Related offerings: ${relatedServices.map((o) => o.title).join("; ")}.`,
          cites: evIdx >= 0 ? [evIdx] : [],
        });
        for (const s of relatedServices) {
          const refId = ctx.evidenceRefs.find((e) => e.id === s.id)?.id;
          claimClassifications.push({
            claim: `${title} offers ${s.title}`,
            classification: claimClassification(ctx.fieldClasses, s, "name"),
            evidenceRefIds: refId ? [refId] : [],
          });
        }
      }
      if (!services && relatedServices.length === 0) {
        return noEvidenceAnswer(ctx, question, ["services offered by this business"]);
      }
    }

    if (hasWord(q, "website", "contact", "email", "phone", "call", "site")) {
      const site = fieldOf(target, "website", "url", "domain");
      const email = fieldOf(target, "email");
      const phone = fieldOf(target, "phone");
      if (site) sentences.push({ text: `Website on record: ${site}.`, cites: [0] });
      if (email) sentences.push({ text: `Email on record: ${email}.`, cites: [0] });
      if (phone) sentences.push({ text: `Phone on record: ${phone}.`, cites: [0] });
      if (!site && !email && !phone) {
        sentences.push({ text: `${title} lists no public contact details in the current context.`, cites: [0] });
      }
    }

    if (hasWord(q, "where", "location", "address", "based")) {
      const loc = fieldOf(target, "location", "address", "city");
      if (loc) sentences.push({ text: `${title} is listed at: ${loc}.`, cites: [0] });
      else sentences.push({ text: `No public location is on record for ${title}.`, cites: [0] });
    }

    if (hasWord(q, "review", "rating", "trust", "proof", "evidence", "verif")) {
      const verified = fieldOf(target, "verified");
      sentences.push({
        text: verified
          ? `${title} carries an explicit verified mark.`
          : `${title} carries no verified mark in the current context.`,
        cites: [0],
      });
      const followers = fieldOf(target, "followerCount", "followers");
      if (followers) sentences.push({ text: `Follower count on record: ${followers}.`, cites: [0] });
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

    if (sentences.length > 0) {
      return {
        ...base,
        answer: sentences.map((s) => cite(s.text, s.cites)).join("\n\n"),
        claimClassifications,
        proposal: null,
        partial: false,
      };
    }

    // Fallback: summarize what is known, honestly.
    const known: Sentence[] = [];
    if (desc) known.push({ text: `${title}: ${desc}`, cites: [0] });
    else known.push({ text: `${title} is a ${ctx.schemaLabel} on record.`, cites: [0] });
    return {
      ...base,
      answer: [
        ...known.map((s) => cite(s.text, s.cites)),
        "I do not have evidence for the rest of that question in the current context, so I will not guess.",
      ].join("\n\n"),
      proposal: null,
      partial: true,
    };
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
