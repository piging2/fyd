/**
 * POST /api/fyd/claims/[resourceId]/release
 *
 * CLAIMED or VERIFIED-CONTROLLED -> OBSERVED. Only the identity that holds
 * the claim can release it. The audit history is preserved.
 * S3-03: requires the env-plus-host gate the overrides approve stage
 * applies (DEMO OWNER MODE on a dev host); 403 otherwise.
 */
import { NextRequest, NextResponse } from "next/server";
import { isValidResourceId, release } from "@/fyd/claim/machine";
import { ClaimError } from "@/fyd/claim/types";
import { resolveClaimIdentity } from "@/fyd/claim/identity";
import { isDemoOwnerModeEnabled, isDevOwnerHost } from "@/fyd/owner-mode/gate";
import { readClaim, writeClaim } from "@/fyd/claim/store";
import { projectClaimForViewer } from "@/fyd/claim/claim-projection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
  // S3-03: the env-plus-host gate the overrides approve stage applies.
  // Releasing writes claim state, so it is DEVELOPMENT OWNER MODE only:
  // NEXT_PUBLIC_FYD_DEMO_OWNER_MODE=1 on a localhost/private-network or
  // explicitly allowlisted host. DEMO OWNER MODE - not real authentication;
  // no identity was verified.
  const demoEnabled = isDemoOwnerModeEnabled();
  const hostPrivate = isDevOwnerHost(req.headers?.get("host") ?? "");
  if (!demoEnabled || !hostPrivate) {
    return NextResponse.json(
      {
        ok: false,
        code: "demo_owner_mode_required",
        error:
          "Claim release requires DEV/DEMO OWNER MODE " +
          "(NEXT_PUBLIC_FYD_DEMO_OWNER_MODE=1) on a localhost or private-network host. " +
          "DEMO OWNER MODE - not real authentication. No identity was verified; " +
          "this mode is for explicit development hosts only.",
        demoOwnerMode: demoEnabled,
        hostPrivate,
      },
      { status: 403 },
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
    // Single claim projection rule: owner-authorized callers receive the
    // owner projection of the stored record.
    return NextResponse.json({ ok: true, claim: projectClaimForViewer(next, "owner") });
  } catch (e) {
    if (e instanceof ClaimError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: 409 });
    }
    throw e;
  }
}
