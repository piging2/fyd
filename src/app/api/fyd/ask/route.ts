/**
 * BFF: Ask FYD. Server-side bounded context builder (object graph plus
 * SiteSpec summary plus evidence plus capabilities) feeding the
 * deterministic site-patch proposal composer.
 *
 * POST { question, targetObjectId?, siteId? } -> AskFydAnswer.
 * The agent never mutates anything here: site-change intents come back as
 * digest-bound site_patch drafts for human approval.
 */

import { NextRequest, NextResponse } from "next/server";
import { BadRequestError, getPingObjectReader } from "@/lib/ping/ping-object-reader";
import { readerErrorResponse } from "@/lib/ping/api-errors";
import { getPracticeIdentityId } from "@/lib/ping/session";
import { buildAskFydContext } from "@/fyd/ask/context-builder";
import { composeAskFyd } from "@/fyd/ask/answer";
import { grantsForViewer, isSiteCapableSchema } from "@/lib/ping/grants";
import { getSiteSpecProvider } from "@/fyd/ask/site-spec";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const viewerId = await getPracticeIdentityId();
    const body: unknown = await request.json().catch(() => null);
    const rec = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
    const question = typeof rec.question === "string" ? rec.question : "";
    if (!question.trim()) throw new BadRequestError("question is required.");
    if (question.length > 2000) throw new BadRequestError("question is too long (max 2000 chars).");
    const targetObjectId = typeof rec.targetObjectId === "string" ? rec.targetObjectId : null;
    const siteId = typeof rec.siteId === "string" ? rec.siteId : targetObjectId;

    const reader = getPingObjectReader();
    const identities = await reader.listIdentities(viewerId).catch(() => []);
    const viewer = {
      id: viewerId,
      displayName: identities.find((i) => i.id === viewerId)?.displayName ?? null,
    };

    if (targetObjectId) {
      const node = await reader.getNode(targetObjectId, viewerId);
      const grants = grantsForViewer({
        viewerId,
        controllerId: node.object.controllerId,
        isSite: isSiteCapableSchema(node.object.schema),
      });
      const siteSpec = siteId ? await getSiteSpecProvider().getSummary(siteId).catch(() => null) : null;
      const ctx = buildAskFydContext({
        viewer,
        target: node.object,
        relatedObjects: node.related,
        relationships: node.relationships,
        plan: node.plan,
        grants,
        siteSpec,
        question: question.trim(),
      });
      return NextResponse.json(composeAskFyd(ctx, question.trim()));
    }

    const ctx = buildAskFydContext({
      viewer,
      target: null,
      relatedObjects: [],
      relationships: [],
      plan: null,
      grants: grantsForViewer({ viewerId, controllerId: "", isSite: false }),
      siteSpec: null,
      question: question.trim(),
    });
    return NextResponse.json(composeAskFyd(ctx, question.trim()));
  } catch (err) {
    return readerErrorResponse(err);
  }
}
