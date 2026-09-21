/**
 * POST /api/fyd/claims/[resourceId]/release
 *
 * CLAIMED or VERIFIED-CONTROLLED -> OBSERVED. Only the identity that holds
 * the claim can release it. The audit history is preserved.
 */
import { NextRequest, NextResponse } from "next/server";
import { isValidResourceId, release } from "@/fyd/claim/machine";
import { ClaimError } from "@/fyd/claim/types";
import { resolveClaimIdentity } from "@/fyd/claim/identity";
import { readClaim, writeClaim } from "@/fyd/claim/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
  const identity = resolveClaimIdentity();
  if (!identity) {
    return NextResponse.json(
      { ok: false, code: "identity-required", message: "Releasing a claim needs an authenticated identity." },
      { status: 401 },
    );
  }
  const current = readClaim(resourceId);
  if (!current) {
    return NextResponse.json(
      { ok: false, code: "not-found", message: "No claim record for this resource." },
      { status: 404 },
    );
  }
  if (current.claimedBy && current.claimedBy.actorId !== identity.actorId) {
    return NextResponse.json(
      { ok: false, code: "not-claimant", message: "Only the identity holding the claim can release it." },
      { status: 403 },
    );
  }
  try {
    const next = release(current, identity.actorLabel);
    writeClaim(next);
    return NextResponse.json({ ok: true, claim: next });
  } catch (e) {
    if (e instanceof ClaimError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: 409 });
    }
    throw e;
  }
}
