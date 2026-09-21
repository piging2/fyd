/**
 * BFF: full Node payload for one object (object + relationships + related
 * objects + controller + capability plan) in a single round trip.
 * GET ?id= -> { node: NodePayload }.
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
    const id = request.nextUrl.searchParams.get("id");
    if (!id) throw new BadRequestError("id is required.");
    const node = await getPingObjectReader().getNode(id, viewerId);
    return NextResponse.json({ node });
  } catch (err) {
    return readerErrorResponse(err);
  }
}
