/**
 * BFF: one sanitized PING object by id (canonical or website-derived).
 * GET ?id= -> { object: PingObject }. Public fields only; private objects
 * are visible only to their controlling identity.
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
    const object = await getPingObjectReader().getObject(id, viewerId);
    return NextResponse.json({ object });
  } catch (err) {
    return readerErrorResponse(err);
  }
}
