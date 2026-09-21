/**
 * GET /api/fyd/claims/verification-methods
 *
 * The verification seam, honestly listed: which proof methods exist and
 * which are actually implemented.
 */
import { NextResponse } from "next/server";
import { listVerificationMethods } from "@/fyd/claim/verification-seam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, methods: listVerificationMethods() });
}
