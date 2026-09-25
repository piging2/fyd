/**
 * POST /api/fyd/claims/[resourceId]/verify
 *
 * CLAIMED -> VERIFIED-CONTROLLED. Body: { "method": "operator-attestation",
 * "basis": "human-readable basis", "operatorLabel"?: "name" }.
 *
 * Only implemented verification methods are accepted; the rest return 501
 * with the full method list so the UI can say what is coming, honestly.
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
import { projectClaimForViewer } from "@/fyd/claim/claim-projection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
