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
 * The subject tenant is constructed server-side into a TenantContext from
 * the validated body siteId (G3 hardening: previously no tenant context
 * existed on this route). New callers should prefer the trusted-path route
 * POST /api/fyd/ask/[siteId], where the tenant comes from the route path
 * and any body-supplied tenant identity is refused on mismatch.
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
 * Errors: 404 unknown site, 400 bad question or mode, 400 tenant_mismatch /
 * invalid_tenant, 503 projection unavailable (answer unknown), 500 bundle
 * invalid or unexpected internal failure. Every failure is structured JSON
 * naming the failure kind; the answer is unknown in every failure case
 * (answerUnknown: true), never an empty body.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleAskRequest(null, request);
}
