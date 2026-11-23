/**
 * POST /api/fyd/claims/[resourceId]/claim
 *
 * OBSERVED -> CLAIMED. Requires an authenticated identity from the claim
 * identity bridge. 401 when none is available (fail closed, never invent).
 * 403 for demo-context objects. 409 when the resource is not observed.
 * S3-03: also requires the env-plus-host gate the overrides approve
 * stage applies (DEMO OWNER MODE on a dev host); 403 otherwise.
 */
import { NextRequest, NextResponse } from "next/server";
import { claim, createObserved, DEMO_CONTEXT_IDS, isValidResourceId } from "@/fyd/claim/machine";
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
  if (DEMO_CONTEXT_IDS.has(resourceId)) {
    return NextResponse.json(
      {
        ok: false,
        code: "demo-context",
        message:
          "This is a source-derived demo object in a labeled demo/testing context. It cannot be claimed.",
      },
      { status: 403 },
    );
  }

  // S3-03: the env-plus-host gate the overrides approve stage applies.
  // Claiming writes claim state, so it is DEVELOPMENT OWNER MODE only:
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
          "Claim actions require DEV/DEMO OWNER MODE " +
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
      {
        ok: false,
        code: "identity-required",
        message:
          "Claiming needs an authenticated identity. Anonymous previews cannot claim.",
      },
      { status: 401 },
    );
  }

  let sourceUrl: string | undefined;
  try {
    const body: unknown = await req.json().catch(() => null);
    const u = (body as { sourceUrl?: unknown } | null)?.sourceUrl;
    if (typeof u === "string" && u.startsWith("http")) sourceUrl = u;
  } catch {
    // Body is optional; ignore parse failures.
  }

  try {
    const current = readClaim(resourceId) ?? createObserved(resourceId, sourceUrl);
    const next = claim(current, identity);
    writeClaim(next);
    // Single claim projection rule: owner-authorized callers receive the
    // owner projection of the stored record.
    return NextResponse.json({ ok: true, claim: projectClaimForViewer(next, "owner") });
  } catch (e) {
    if (e instanceof ClaimError) {
      const status = e.code === "bad-transition" ? 409 : 400;
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status });
    }
    throw e;
  }
}
