/**
 * POST /api/fyd/claims/[resourceId]/claim
 *
 * OBSERVED -> CLAIMED. Requires an authenticated identity from the claim
 * identity bridge. 401 when none is available (fail closed, never invent).
 * 403 for demo-context objects. 409 when the resource is not observed.
 */
import { NextRequest, NextResponse } from "next/server";
import { claim, createObserved, DEMO_CONTEXT_IDS, isValidResourceId } from "@/fyd/claim/machine";
import { ClaimError } from "@/fyd/claim/types";
import { resolveClaimIdentity } from "@/fyd/claim/identity";
import { readClaim, writeClaim } from "@/fyd/claim/store";

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
    return NextResponse.json({ ok: true, claim: next });
  } catch (e) {
    if (e instanceof ClaimError) {
      const status = e.code === "bad-transition" ? 409 : 400;
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status });
    }
    throw e;
  }
}
