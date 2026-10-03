/**
 * GET /api/fyd/claims/[resourceId]
 *
 * Read a resource claim through the single claim projection boundary
 * (src/fyd/claim/claim-projection.ts; Nolan 2026-09-25 binding decision:
 * claim existence/status may be public; the full internal claim record is
 * NOT the public representation).
 *
 * Viewer resolution reuses the EXISTING demo-owner machinery (no new
 * authority, no new auth):
 *   owner     - NEXT_PUBLIC_FYD_DEMO_OWNER_MODE=1 AND a localhost or
 *               private-network Host (same gate as the customize API).
 *   anonymous - everyone else.
 * An unknown viewer fails closed: the projection returns null and this
 * route serves a 503 with no claim data of any shape.
 *
 * 404 when no record exists (missing data fails honest; nothing is
 * invented). 400 on a malformed resource id.
 */
import { NextRequest, NextResponse } from "next/server";
import { isValidResourceId } from "@/fyd/claim/machine";
import { readClaim } from "@/fyd/claim/store";
import {
  CLAIM_PROJECTION_VERSION,
  projectClaimForViewer,
  type ClaimViewerKind,
} from "@/fyd/claim/claim-projection";
import { isDevOwnerHost } from "@/fyd/owner-mode/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolve the viewer kind for this request from the existing demo-owner
 * machinery. Total: always "owner" or "anonymous", never unknown.
 */
function resolveClaimViewerKind(req: NextRequest): ClaimViewerKind {
  const enabled = process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE === "1";
  const host = req.headers.get("host") ?? "";
  if (enabled && isDevOwnerHost(host)) return "owner";
  return "anonymous";
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ resourceId: string }> },
): Promise<NextResponse> {
  const { resourceId } = await ctx.params;
  if (!isValidResourceId(resourceId)) {
    return NextResponse.json(
      { ok: false, code: "invalid-resource-id", message: "Malformed resource id." },
      { status: 400 },
    );
  }
  const claim = readClaim(resourceId);
  if (!claim) {
    return NextResponse.json(
      { ok: false, code: "not-found", message: "No claim record for this resource." },
      { status: 404 },
    );
  }
  const viewerKind = resolveClaimViewerKind(req);
  const projected = projectClaimForViewer(claim, viewerKind);
  if (!projected) {
    // Unknown viewer (or unreadable record): fail closed. No claim data
    // of any shape is served.
    return NextResponse.json(
      {
        ok: false,
        code: "viewer-not-authorized",
        message: "Claim unavailable for this viewer.",
      },
      { status: 503 },
    );
  }
  return NextResponse.json({
    ok: true,
    viewerKind,
    projectionVersion: CLAIM_PROJECTION_VERSION,
    claim: projected,
  });
}
