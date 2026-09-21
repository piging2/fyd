/**
 * BFF: public Circle projection for one identity.
 * GET ?identityId= (defaults to the session identity)
 * -> PublicCircleProjection. Public fields only; the raw journal never
 * reaches the browser.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPingObjectReader, BadRequestError } from "@/lib/ping/ping-object-reader";
import { readerErrorResponse } from "@/lib/ping/api-errors";
import { getPracticeIdentityId } from "@/lib/ping/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const viewerId = await getPracticeIdentityId();
    const identityId = request.nextUrl.searchParams.get("identityId") || viewerId;
    if (!identityId) throw new BadRequestError("identityId is required (or select a practice identity).");
    const profile = await getPingObjectReader().getProfile(identityId, viewerId);
    return NextResponse.json({ profile });
  } catch (err) {
    return readerErrorResponse(err);
  }
}
