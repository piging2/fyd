/**
 * Site-patch proposal drafting for Ask FYD.
 *
 * The agent NEVER mutates the site or the graph. It drafts a site_patch
 * proposal: an ordered list of SiteSpec transitions bound to the exact
 * spec digest it reasoned over. The human approves the exact proposal
 * digest; the approved transition is applied through the governed event
 * path (OBJECT_UPDATED carrying the digest-bound patch), never by the agent.
 *
 * Deterministic: same context plus same question always yields the same
 * proposal and the same digest.
 */

import { proposalDigest, verifyProposalDigest } from "../../lib/ping/ask-composer";
import { signEnvelope, verifyEnvelope } from "./envelope";
import type { Signer } from "./envelope";
import type {
  AskProposal,
  PingObject,
  SitePatchOperation,
  SitePatchPayload,
} from "../../lib/ping/types";
import type { AskFydContext, SitePatchCard, SitePatchIntent } from "./types";

function hasWord(q: string, ...words: string[]): boolean {
  return words.some((w) => new RegExp(`\\b${w}\\b`).test(q));
}

/** Service-ish objects among the related set, in a stable order. */
function serviceObjects(ctx: AskFydContext): PingObject[] {
  return ctx.base.relatedObjects
    .filter((o) => /service|product|offer/i.test(o.schema))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function objectTitle(ctx: AskFydContext, id: string): string {
  if (ctx.base.target?.id === id) return ctx.base.target.title || id;
  const found = ctx.base.relatedObjects.find((o) => o.id === id);
  return found?.title || id;
}

/** Evidence citation for an object id, using the composer's 1-based convention. */
function cite(ctx: AskFydContext, objectId: string): string {
  const idx = ctx.base.evidenceRefs.findIndex((r) => r.id === objectId);
  return idx >= 0 ? `[${idx + 1}]` : "";
}

function cleanName(raw: string): string {
  return raw
    .replace(/\b(my|the|our|this|that)\b/g, " ")
    .replace(/\s+/g, " ")
    .replace(/["'.?!]+$/g, "")
    .trim();
}

/**
 * Keyword-anchored service name matching: the request names the service
 * loosely ("electrical services" for the "Electrical" object), so a match
 * holds when either side contains the other or every request word appears
 * in the title.
 */
function serviceNameMatches(title: string, serviceName: string): boolean {
  const t = title.toLowerCase();
  const s = serviceName.toLowerCase();
  if (!t || !s) return false;
  if (t.includes(s) || s.includes(t)) return true;
  const tWords = new Set(t.split(/\s+/));
  const sWords = s.split(/\s+/).filter(Boolean);
  return sWords.length > 0 && sWords.every((w) => tWords.has(w));
}

/**
 * Detect a site-patch intent in the question. Returns null when the
 * question is not a site-change request. Detection is keyword-anchored;
 * authority checks happen separately in sitePatchRefusal.
 */
export function detectSitePatchIntent(ctx: AskFydContext, question: string): SitePatchIntent | null {
  const q = question.toLowerCase().trim();

  const reorderMatch =
    q.match(/\bput\b\s+(.+?)\s+\b(first|at the top)\b/) ?? q.match(/\bmove\b\s+(.+?)\s+\bto the top\b/);
  if (reorderMatch) {
    const serviceName = cleanName(reorderMatch[1]);
    if (serviceName) return { kind: "reorder_services_first", serviceName };
  }

  const featureMatch =
    q.match(/\bfeature\b\s+(.+)/) ?? q.match(/\bhighlight\b\s+(.+)/) ?? q.match(/\bspotlight\b\s+(.+)/);
  if (featureMatch) {
    const name = cleanName(featureMatch[1]);
    if (name.length > 2) {
      const candidates = [ctx.base.target, ...ctx.base.relatedObjects].filter(
        (o): o is PingObject => !!o && !!o.title && o.title.toLowerCase().includes(name),
      );
      if (candidates.length > 0) {
        const best = candidates.sort((a, b) => (a.title ?? "").length - (b.title ?? "").length)[0];
        return { kind: "feature_object", objectId: best.id, objectTitle: best.title ?? best.id };
      }
    }
  }

  if (
    hasWord(q, "professionalize") ||
    (hasWord(q, "professional", "polish", "formal") &&
      hasWord(q, "tone", "site", "page", "make", "more", "sound"))
  ) {
    return { kind: "professionalize" };
  }

  return null;
}

/**
 * Authority check for site-patch drafting. Returns the refusal text when
 * the agent must not draft, null when drafting may proceed. The agent
 * explains WHY instead of silently failing.
 */
export function sitePatchRefusal(ctx: AskFydContext): string | null {
  if (!ctx.siteSpec) {
    return "I do not have your site spec in context, so I cannot draft a site change. Open the site this question is about and ask again.";
  }
  if (!ctx.base.target) {
    return "I need the site object in context to draft a change. Open the site and ask again.";
  }
  if (!ctx.grants.includes("site.propose")) {
    return "Only the controlling identity can change this site. I can draft site changes for the owner, but I cannot draft them for anyone else.";
  }
  return null;
}

interface DraftedPatch {
  operations: SitePatchOperation[];
  affectedObjects: { id: string; title: string }[];
  evidenceReason: string;
  summary: string;
}

type DraftResult = { proposal: AskProposal } | { refusal: string };

function servicesSectionId(ctx: AskFydContext): string | null {
  const sections = ctx.siteSpec?.page.sections ?? [];
  const byComponent = sections.find((s) => /service/i.test(s.component));
  return byComponent ? byComponent.id : (sections[0]?.id ?? null);
}

function draftReorderServicesFirst(ctx: AskFydContext, serviceName: string): DraftedPatch | { refusal: string } {
  const spec = ctx.siteSpec;
  if (!spec) return { refusal: "Site-patch drafting needs the site spec in context." };
  const match = serviceObjects(ctx).find((o) => serviceNameMatches(o.title ?? "", serviceName));
  if (!match) {
    return {
      refusal: `I could not find a service matching "${serviceName}" among this site's offerings, so I cannot reorder them.`,
    };
  }
  const sectionId = servicesSectionId(ctx);
  if (!sectionId) return { refusal: "The site spec has no sections to reorder." };
  const current = spec.sectionObjects[sectionId] ?? [];
  const after = [match.id, ...current.filter((id) => id !== match.id)];
  if (after.join("|") === current.join("|")) {
    return { refusal: `"${match.title}" is already first, so there is nothing to change.` };
  }
  const titles = (ids: string[]) => ids.map((id) => objectTitle(ctx, id)).join(", ");
  return {
    operations: [{ op: "reorder_section_objects", pageSlug: spec.pageSlug, sectionId, before: current, after }],
    affectedObjects: after.map((id) => ({ id, title: objectTitle(ctx, id) })),
    evidenceReason: `Service "${match.title}" appears in the site spec section ${cite(ctx, match.id)} and in the related offerings. Moving it first matches the request; no other content changes.`,
    summary: `Move "${match.title}" first: [${titles(current)}] becomes [${titles(after)}].`,
  };
}

function draftProfessionalize(ctx: AskFydContext): DraftedPatch | { refusal: string } {
  const spec = ctx.siteSpec;
  if (!spec) return { refusal: "Site-patch drafting needs the site spec in context." };
  const sectionId = spec.page.sections[0]?.id;
  if (!sectionId) return { refusal: "The site spec has no sections." };
  const before = spec.presentation[sectionId]?.["tone"] ?? null;
  if (before === "professional") {
    return { refusal: "The site tone is already professional, so there is nothing to change." };
  }
  return {
    operations: [
      { op: "set_presentation", pageSlug: spec.pageSlug, sectionId, field: "tone", before, after: "professional" },
    ],
    affectedObjects: [],
    evidenceReason: `The request asks for a more professional tone ${cite(ctx, ctx.base.target?.id ?? "")}. This changes only the declared presentation tone from ${before ?? "unset"} to professional; copy and structure are untouched.`,
    summary: `Set tone to professional (was ${before ?? "unset"}).`,
  };
}

function draftFeatureObject(
  ctx: AskFydContext,
  objectId: string,
  title: string,
): DraftedPatch | { refusal: string } {
  const spec = ctx.siteSpec;
  if (!spec) return { refusal: "Site-patch drafting needs the site spec in context." };
  const sectionId =
    spec.page.sections.find((s) => /feature|highlight|project|work/i.test(s.component))?.id ??
    spec.page.sections[0]?.id;
  if (!sectionId) return { refusal: "The site spec has no sections." };
  const raw = spec.presentation[sectionId]?.["featuredIds"];
  const before: string[] = Array.isArray(raw) ? [...raw] : [];
  if (before.includes(objectId)) {
    return { refusal: `"${title}" is already featured, so there is nothing to change.` };
  }
  const after = [objectId, ...before];
  return {
    operations: [{ op: "set_presentation", pageSlug: spec.pageSlug, sectionId, field: "featuredIds", before, after }],
    affectedObjects: [{ id: objectId, title }],
    evidenceReason: `"${title}" is in the site's evidence ${cite(ctx, objectId)}. Featuring it changes only the section's featured list; nothing else moves.`,
    summary: `Feature "${title}" in section ${sectionId}.`,
  };
}

/** One-line summary per operation, stored in the proposal changes map. */
export function describeOperation(op: SitePatchOperation, ctx: AskFydContext): string {
  const title = (id: string) => objectTitle(ctx, id);
  if (op.op === "reorder_section_objects") {
    return `section ${op.sectionId}: order [${op.before.map(title).join(", ")}] -> [${op.after.map(title).join(", ")}]`;
  }
  return `section ${op.sectionId}: ${op.field} ${JSON.stringify(op.before)} -> ${JSON.stringify(op.after)}`;
}

/**
 * Draft the site_patch proposal for an intent. Deterministic: same context
 * plus same intent always yields the same body and digest. Returns a
 * refusal when the intent cannot be grounded in the spec.
 */
export function draftSitePatchProposal(ctx: AskFydContext, intent: SitePatchIntent): DraftResult {
  const spec = ctx.siteSpec;
  const target = ctx.base.target;
  if (!spec || !target)
    return { refusal: "Site-patch drafting needs the site spec and the site object in context." };

  let drafted: DraftedPatch | { refusal: string };
  switch (intent.kind) {
    case "reorder_services_first":
      drafted = draftReorderServicesFirst(ctx, intent.serviceName);
      break;
    case "professionalize":
      drafted = draftProfessionalize(ctx);
      break;
    case "feature_object":
      drafted = draftFeatureObject(ctx, intent.objectId, intent.objectTitle);
      break;
  }
  if ("refusal" in drafted) return drafted;

  const changes: Record<string, string> = {};
  drafted.operations.forEach((op, i) => {
    changes[`op${i + 1}`] = describeOperation(op, ctx);
  });
  const sitePatch: SitePatchPayload = {
    siteId: spec.siteId,
    pageSlug: spec.pageSlug,
    operations: drafted.operations,
    siteSpecDigest: spec.digest,
    affectedObjects: drafted.affectedObjects,
    evidenceReason: drafted.evidenceReason,
  };
  const body = {
    kind: "site_patch" as const,
    targetObjectId: target.id,
    schema: "ping.social.proposal@1",
    changes,
    sitePatch,
  };
  const proposal: AskProposal = {
    ...body,
    digest: proposalDigest(body),
    digestAlgorithm: "sha256-canonical-json-v1",
    note:
      drafted.summary +
      " Review the Before / After below. Approving applies this exact SiteSpec transition through the governed event path. I cannot apply it myself.",
    envelope: null,
  };
  return { proposal };
}

/**
 * Sign a drafted site_patch proposal. The envelope body is exactly the
 * digest input, so the envelope's payload_hash must equal the proposal
 * digest (one serializer for digests and signatures); a mismatch throws
 * instead of producing a half-signed proposal.
 */
export function signSitePatchDraft(proposal: AskProposal, signer: Signer): AskProposal {
  if (proposal.kind !== "site_patch") {
    throw new Error("signSitePatchDraft: only site_patch proposals are signed here.");
  }
  const body = {
    kind: proposal.kind,
    targetObjectId: proposal.targetObjectId,
    schema: proposal.schema,
    changes: proposal.changes,
    sitePatch: proposal.sitePatch,
  };
  const signed = signEnvelope({ ...body }, signer);
  if (signed.payload_hash !== proposal.digest) {
    throw new Error("signSitePatchDraft: envelope payload hash does not match the proposal digest.");
  }
  return { ...proposal, envelope: signed };
}

/**
 * Verify a signed draft: digest re-verification plus envelope signature and
 * hash binding. Unsigned drafts verify on the digest alone (the server-side
 * approval law); a present-but-broken envelope fails closed.
 */
export function verifySignedSitePatchDraft(proposal: AskProposal): boolean {
  if (!verifyProposalDigest(proposal)) return false;
  if (!proposal.envelope) return true;
  if (proposal.envelope.payload_hash !== proposal.digest) return false;
  return verifyEnvelope(proposal.envelope);
}

/** Build the human review card: Before, After, Evidence reason, Affected objects. */
export function buildSitePatchCard(ctx: AskFydContext, proposal: AskProposal): SitePatchCard | null {
  if (proposal.kind !== "site_patch") return null;
  const patch = proposal.sitePatch;
  const title = (id: string) => objectTitle(ctx, id);
  const before: string[] = [];
  const after: string[] = [];
  for (const op of patch.operations) {
    if (op.op === "reorder_section_objects") {
      before.push(`Section ${op.sectionId} order: ${op.before.map(title).join(", ")}`);
      after.push(`Section ${op.sectionId} order: ${op.after.map(title).join(", ")}`);
    } else {
      before.push(`Section ${op.sectionId} ${op.field}: ${JSON.stringify(op.before)}`);
      after.push(`Section ${op.sectionId} ${op.field}: ${JSON.stringify(op.after)}`);
    }
  }
  return {
    title: `Site change proposal for ${ctx.base.target?.title ?? patch.siteId}`,
    before,
    after,
    evidenceReason: patch.evidenceReason,
    affectedObjects: patch.affectedObjects,
    operationCount: patch.operations.length,
    siteSpecDigest: patch.siteSpecDigest,
  };
}
