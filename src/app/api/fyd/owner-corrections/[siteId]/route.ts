/**
 * /api/fyd/owner-corrections/[siteId]: the D3 Option B mount (desk
 * ruling 2026-11-19, RULING 2): the narrow authenticated correction
 * surface, first production mount of an owner surface.
 *
 * GET: the tenant's correction record: every extracted field with
 *        its status, conflicts with both values and sources, and the
 *        corrections history (the WP8 record view).
 * POST: one owner correction in the admitted contact class (phone,
 *        email, website), admitted through the tenant-keyed rate
 *        ledger and written only through the authorized intake.
 *
 * Authentication is the existing identity authority only: the caller
 * presents a provisioned key in the x-mc-caller-key header; the
 * caller-key provider resolves it against the operator-provisioned
 * registry and the caller's credential-derived entitlement set decides
 * which tenants it may touch. Missing or unknown key: 401. A key
 * entitled to a different tenant: 403, before any I/O for the target
 * tenant. The demo owner context is never used on this route.
 *
 * Header: x-mc-caller-key: <operator-provisioned key>
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getCorrectionRecord,
  submitCorrection,
  type SurfaceDenial,
} from "@/fyd/owner-mode/correction-surface";

export const dynamic = "force-dynamic";

function denialResponse(denial: SurfaceDenial): NextResponse {
  const body: Record<string, unknown> = {
    ok: false,
    code: denial.code,
    reason: denial.reason,
  };
  if (denial.code === "rate_limited") {
    body.scope = denial.scope;
    body.retryAfterMs = denial.retryAfterMs;
  }
  return NextResponse.json(body, { status: denial.status });
}

function invalidInput(reason: string): NextResponse {
  return NextResponse.json(
    { ok: false, code: "invalid_input", reason },
    { status: 400 },
  );
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ siteId: string }> },
): Promise<NextResponse> {
  const { siteId } = await ctx.params;
  const result = await getCorrectionRecord({
    callerKey: req.headers.get("x-mc-caller-key"),
    siteId,
  });
  if (!result.ok) return denialResponse(result);
  return NextResponse.json({ ok: true, ...result.record });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ siteId: string }> },
): Promise<NextResponse> {
  const { siteId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidInput("The request body must be a JSON correction.");
  }
  const b: Record<string, unknown> =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const objectId = typeof b.objectId === "string" ? b.objectId : "";
  const field = typeof b.field === "string" ? b.field : "";
  const value = typeof b.value === "string" ? b.value : "";
  if (!objectId || !field || !value) {
    return invalidInput(
      "A correction requires objectId, field, and a non-empty value.",
    );
  }
  const index =
    typeof b.index === "number" && Number.isInteger(b.index) && b.index >= 0
      ? b.index
      : 0;

  const result = await submitCorrection({
    callerKey: req.headers.get("x-mc-caller-key"),
    siteId,
    objectId,
    field,
    index,
    value,
    sourceValueSeen:
      typeof b.sourceValueSeen === "string" ? b.sourceValueSeen : undefined,
  });
  if (!result.ok) return denialResponse(result);
  return NextResponse.json({
    ok: true,
    assertionId: result.assertion.assertionId,
    eventType: result.event.type,
  });
}
