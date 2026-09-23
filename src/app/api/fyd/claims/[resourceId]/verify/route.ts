/**
 * POST /api/fyd/claims/[resourceId]/verify
 *
 * CLAIMED -> VERIFIED-CONTROLLED. Body: { "method": "operator-attestation",
 * "basis": "human-readable basis", "operatorLabel"?: "name" }.
 *
 * Only implemented verification methods are accepted; the rest return 501
 * with the full method list so the UI can say what is coming, honestly.
 *
 * DEMO OWNER MODE GATE: this route WRITES claim state (operator
 * attestation), so it requires DEV/DEMO OWNER MODE:
 * NEXT_PUBLIC_FYD_DEMO_OWNER_MODE=1 on a localhost or private-network
 * host. Anything else gets a typed 403
 * { ok:false, code:"demo_owner_mode_required" } and nothing is written.
 * DEMO OWNER MODE IS NOT PRODUCTION AUTHENTICATION: no identity is
 * verified here; operator attestation is a labeled statement, not a
 * cryptographic proof of domain control.
 */
import { NextRequest, NextResponse } from "next/server";
import { isValidResourceId, verifyControl } from "@/fyd/claim/machine";
import { ClaimError, type VerificationMethod } from "@/fyd/claim/types";
import {
  attestOperatorControl,
  isVerificationMethodImplemented,
  listVerificationMethods,
} from "@/fyd/claim/verification-seam";
import { readClaim, writeClaim } from "@/fyd/claim/store";
import { isDemoOwnerModeEnabled, isPrivateHost } from "@/fyd/owner-mode/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_REAL_AUTH =
  "DEMO OWNER MODE - not real authentication. No identity was verified; " +
  "this mode is for localhost/private-network demonstration only.";

/**
 * Demo-owner-mode gate (same contract as the customize approval API and
 * the object overrides route): refuse with a typed 403 unless
 * NEXT_PUBLIC_FYD_DEMO_OWNER_MODE=1 AND the request arrived on a
 * localhost/private-network host. Default off; absent/false => fail closed.
 */
function demoDenied(req: NextRequest) {
  const enabled = isDemoOwnerModeEnabled();
  const host = req.headers.get("host") ?? "";
  const privateNet = isPrivateHost(host);
  if (!enabled || !privateNet) {
    return NextResponse.json(
      {
        ok: false,
        code: "demo_owner_mode_required",
        error:
          "Claim verification requires DEV/DEMO OWNER MODE " +
          "(NEXT_PUBLIC_FYD_DEMO_OWNER_MODE=1) on a localhost or private-network host. " +
          NOT_REAL_AUTH,
        demoOwnerMode: enabled,
        hostPrivate: privateNet,
      },
      { status: 403 },
    );
  }
  return null;
}

const METHODS: VerificationMethod[] = [
  "dns-txt",
  "well-known-file",
  "html-meta-tag",
  "cms-integration",
  "provider-evidence",
  "operator-attestation",
];

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ resourceId: string }> },
): Promise<NextResponse> {
  // Gate before any parsing or I/O: verification writes claim state.
  const gate = demoDenied(req);
  if (gate) return gate;

  const { resourceId } = await ctx.params;
  if (!isValidResourceId(resourceId)) {
    return NextResponse.json(
      { ok: false, code: "invalid-resource-id", message: "Malformed resource id." },
      { status: 400 },
    );
  }

  let body: { method?: unknown; basis?: unknown; operatorLabel?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-body", message: "Request body must be JSON." },
      { status: 400 },
    );
  }
  const method = body.method;
  if (typeof method !== "string" || !METHODS.includes(method as VerificationMethod)) {
    return NextResponse.json(
      {
        ok: false,
        code: "unknown-method",
        message: "Unknown verification method.",
        methods: listVerificationMethods(),
      },
      { status: 400 },
    );
  }
  if (!isVerificationMethodImplemented(method as VerificationMethod)) {
    return NextResponse.json(
      {
        ok: false,
        code: "method-unimplemented",
        message: "This verification method is not built yet.",
        methods: listVerificationMethods(),
      },
      { status: 501 },
    );
  }

  const current = readClaim(resourceId);
  if (!current) {
    return NextResponse.json(
      { ok: false, code: "not-found", message: "No claim record for this resource." },
      { status: 404 },
    );
  }

  try {
    const operatorLabel =
      typeof body.operatorLabel === "string" && body.operatorLabel.trim()
        ? body.operatorLabel.trim()
        : (current.claimedBy?.actorLabel ?? "operator");
    const proof = attestOperatorControl({
      resourceId,
      operatorLabel,
      basis: typeof body.basis === "string" ? body.basis : "",
    });
    const next = verifyControl(current, proof);
    writeClaim(next);
    return NextResponse.json({ ok: true, claim: next });
  } catch (e) {
    if (e instanceof ClaimError) {
      const status = e.code === "bad-transition" ? 409 : 400;
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status });
    }
    throw e;
  }
}
