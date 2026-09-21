/**
 * BFF: capability-aware action plan for one object. The same plan drives
 * the human UI action row and the agent context builder.
 * GET ?objectId= -> { plan: CapabilityPlan }.
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
    const objectId = request.nextUrl.searchParams.get("objectId");
    if (!objectId) throw new BadRequestError("objectId is required.");
    const plan = await getPingObjectReader().planActions(viewerId, objectId);
    return NextResponse.json({ plan });
  } catch (err) {
    return readerErrorResponse(err);
  }
}
