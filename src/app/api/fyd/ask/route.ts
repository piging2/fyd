import { NextRequest, NextResponse } from "next/server";
import { handleAskRequest } from "./ask-pipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/fyd/ask (legacy flat route).
 *
 * Visitor Ask FYD: evidence-bounded Q&A over a site's PUBLIC objects only.
 *
 * Body: { siteId: string, objectId?: string, question: string, mode?: "visitor" | "owner" }
 *
 * - mode "visitor" (default): anonymous, public objects only, no grants.
 * - mode "owner": accepted for a future authenticated lane; until that lane
 *   exists it is treated as visitor-safe and grants nothing.
 *
 * The subject tenant is NEVER taken from the request body on this route
 * (Q-P0-06 Mission M deprecation of the body-tenant claim). A request with
 * a body siteId is 308-redirected to the trusted-path route
 * POST /api/fyd/ask/[siteId], where the tenant comes from the route path
 * and any body-supplied tenant identity is refused on mismatch. A request
 * with no usable body siteId is refused with 400 flat_route_deprecated.
 * Nothing is ever served from this route. New callers must use
 * POST /api/fyd/ask/[siteId] directly.
 *
 * Response: { ok: true, answer, answerClass, answerState, refusal,
 *   citations, objectRefs, evidenceRefs, sourceRefs, unknowns,
 *   suggestedActions, proposal, tenantId }
 *   unknowns is string[]; suggestedActions is the available-actions list
 *   ([] when none); proposal is a draft AskProposal or null.
 *   answerClass is exactly one of "SUPPORTED DIRECTLY" | "SUPPORTED BY
 *   MULTIPLE EVIDENCE" | "DERIVED" | "CONFLICTED" | "UNSUPPORTED"
 *   ("UNSUPPORTED" = refusal). answerState is the coarse state fed by it:
 *   "KNOWN" | "CONFLICTED" | "UNKNOWN".
 *   Every citation carries claimClass ("SUPPORTED DIRECTLY" | "DERIVED" |
 *   "CONFLICTED"). objectRefs, evidenceRefs, sourceRefs are structured,
 *   citation-backed refs; nothing here is ever invented.
 * Responses: 308 redirect to /api/fyd/ask/[siteId] when a body siteId is
 * present (nothing is served here); 400 flat_route_deprecated when no
 * usable body siteId is present; 400 invalid_tenant for a malformed slug.
 * Every refusal is structured JSON naming the failure kind.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleAskRequest(null, request);
}
