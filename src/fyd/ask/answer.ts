/**
 * Ask FYD answer composer: deterministic, evidence-backed, never
 * authorizing. Site-change intents become site_patch proposals; everything
 * else delegates to the existing composer. The composer drafts only: the
 * human approves the exact digest.
 */

import { composeAnswer } from "../../lib/ping/ask-composer";
import type { ComposeAnswerOpts } from "../../lib/ping/ask-composer";
import {
  conflictObservationRefId,
  isUnresolvedConflict,
} from "./field-conflicts";
import type { AskAnswer } from "../../lib/ping/types";
import {
  buildSitePatchCard,
  detectSitePatchIntent,
  draftSitePatchProposal,
  sitePatchRefusal,
} from "./site-patch";
import type { AskFydAnswer, AskFydContext } from "./types";

const SITE_PATCH_ACTION_KINDS = new Set([
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
]);

function baseFields(
  ctx: AskFydContext,
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
    evidenceRefs: ctx.base.evidenceRefs,
    claimClassifications: [],
    unknowns: [],
    sourceUrls: ctx.base.sourceUrls,
    relatedObjects: ctx.base.relatedObjects
      .slice(0, 5)
      .map((o) => ({ id: o.id, schema: o.schema, title: o.title || o.id })),
    suggestedActions: (ctx.base.plan?.actions ?? []).filter((a) => SITE_PATCH_ACTION_KINDS.has(a.kind)),
  };
}

function refusalAnswer(ctx: AskFydContext, text: string): AskFydAnswer {
  return { ...baseFields(ctx), answer: text, proposal: null, partial: true, sitePatchCard: null };
}

/**
 * Compose the Ask FYD answer. Site-patch intents are detected first; when
 * the viewer may propose, a digest-bound draft is returned with its review
 * card. All other questions use the existing evidence-backed composer.
 */
export function composeAskFyd(ctx: AskFydContext, question: string): AskFydAnswer {
  const intent = detectSitePatchIntent(ctx, question);
  if (intent) {
    const refusal = sitePatchRefusal(ctx);
    if (refusal) return refusalAnswer(ctx, refusal);
    const drafted = draftSitePatchProposal(ctx, intent);
    if ("refusal" in drafted) return refusalAnswer(ctx, drafted.refusal);
    const proposal = drafted.proposal;
    return {
      ...baseFields(ctx),
      answer: proposal.note,
      proposal,
      partial: false,
      sitePatchCard: buildSitePatchCard(ctx, proposal),
    };
  }
  // FYD-Q1: register both evidence chains for every unresolved conflict
  // BEFORE the composer runs, so the locked "being verified" copy can cite
  // them. Observation values are never embedded: the labels name the field
  // and the provenance, not the disputed value.
  const conflictedFields: NonNullable<ComposeAnswerOpts["conflictedFields"]> = [];
  for (const conflict of ctx.fieldConflicts) {
    if (!isUnresolvedConflict(conflict)) continue;
    const evidenceIndices: number[] = [];
    conflict.observations.forEach((obs, i) => {
      evidenceIndices.push(ctx.base.evidenceRefs.length);
      const derived = obs.derivedAt ? `, recorded ${obs.derivedAt.slice(0, 10)}` : "";
      ctx.base.evidenceRefs.push({
        kind: "field",
        id: conflictObservationRefId(conflict, i),
        label: `${conflict.field}: conflicting observation ${i + 1} of ${conflict.observations.length} (value withheld while unresolved)`,
        detail: `Conflicting observation: provenance ${obs.provenanceKind}, ref ${obs.provenanceRef}${derived}. Values are withheld until the conflict is resolved.`,
      });
    });
    conflictedFields.push({
      objectId: conflict.objectId,
      field: conflict.field,
      evidenceIndices,
    });
  }
  const base = composeAnswer(ctx.base, question, { conflictedFields });
  return { ...base, sitePatchCard: null };
}
