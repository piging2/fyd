/**
 * GET /api/fyd/claims/[resourceId]
 *
 * Read a resource claim. 404 when no record exists (missing data fails
 * honest; nothing is invented). 400 on a malformed resource id.
 */
import { NextRequest, NextResponse } from "next/server";
import { isValidResourceId } from "@/fyd/claim/machine";
import { readClaim } from "@/fyd/claim/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
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
  return NextResponse.json({ ok: true, claim });
}
