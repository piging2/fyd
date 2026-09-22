import { NextRequest, NextResponse } from "next/server";
import { handleAskRequest } from "../ask-pipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/fyd/ask/[siteId] (trusted-path route; G3).
 *
 * Visitor Ask FYD: evidence-bounded Q&A over a site's PUBLIC objects only.
 * The tenant is derived from the route path param, never from the request
 * body or URL query: a TenantContext is constructed server-side via
 * requireTenantContext (which also enforces the DNS-safe slug pattern).
 *
 * Body: { question: string, objectId?: string, mode?: "visitor" | "owner" }
 *   objectId selects the target object inside the route tenant public graph
 *   (unknown ids fail closed as 404 unknown_object).
 *
 * Any body-supplied tenant identity (siteId / tenantId / tenant keys) that
 * disagrees with the route tenant is REFUSED with 400 tenant_mismatch: the
 * request is served for the route tenant or refused, never for the
 * body-claimed tenant. A matching claim is harmless and ignored.
 *
 * - mode "visitor" (default): anonymous, public objects only, no grants.
 * - mode "owner": accepted for a future authenticated lane; until that lane
 *   exists it is treated as visitor-safe and grants nothing.
 *
 * Response: { ok: true, answer, answerClass, refusal, citations,
 *   unknowns, suggestedActions, proposal, tenantId }
 *   unknowns is string[]; suggestedActions is the available-actions list
 *   ([] when none); proposal is a draft AskProposal or null.
 *   answerClass is "supported" | "derived" | "unknown" (unknown = refusal).
 *   Every citation carries claimClass ("supported" | "derived").
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
): Promise<NextResponse> {
  const { siteId } = await params;
  return handleAskRequest(siteId, request);
}
