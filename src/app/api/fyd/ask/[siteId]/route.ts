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
 * Body: { question: string, mode?: "visitor" | "owner" }
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
 * Response: { ok: true, answer, answerClass, refusal, citations, tenantId }
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
