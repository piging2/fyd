/**
 * GET /api/fyd/claims/identity
 *
 * Which identity, if any, is available for claiming in this build.
 * Demo-owner mode is the only source right now and is labeled as such.
 * Null identity means claiming is unavailable: the UI must not offer it.
 */
import { NextResponse } from "next/server";
import { resolveClaimIdentity } from "@/fyd/claim/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const identity = resolveClaimIdentity();
  return NextResponse.json({ ok: true, identity });
}
