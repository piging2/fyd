/**
 * Ask FYD answer composer: deterministic, evidence-backed, never
 * authorizing. Site-change intents become site_patch proposals; everything
 * else delegates to the existing composer. The composer drafts only: the
 * human approves the exact digest.
 */

import { composeAnswer } from "../../lib/ping/ask-composer";
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
  const base = composeAnswer(ctx.base, question);
  return { ...base, sitePatchCard: null };
}
