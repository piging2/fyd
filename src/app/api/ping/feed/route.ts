/**
 * BFF: object discovery feed. Deterministic ranking, no infinite scroll:
 * page with ?limit= and ?offset=.
 * GET -> { items: DiscoveryFeedItem[], gatewayAvailable: boolean }.
 * When the gateway path is down, website-derived content is still served
 * and gatewayAvailable is false. Nothing is faked.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPingObjectReader } from "@/lib/ping/ping-object-reader";
import { readerErrorResponse } from "@/lib/ping/api-errors";
import { getPracticeIdentityId } from "@/lib/ping/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const viewerId = await getPracticeIdentityId();
    const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 20));
    const offset = Math.max(0, Number(request.nextUrl.searchParams.get("offset")) || 0);
    // Over-fetch deterministically so offset paging is stable.
    const { items, gatewayAvailable } = await getPingObjectReader().getDiscoveryFeed(
      viewerId,
      limit + offset,
    );
    return NextResponse.json({ items: items.slice(offset, offset + limit), gatewayAvailable });
  } catch (err) {
    return readerErrorResponse(err);
  }
}
