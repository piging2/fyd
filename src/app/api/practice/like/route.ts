/**
 * BFF: like / unlike a post object as the session identity.
 * POST   { objectId } -> { ok: true } (canonical RELATIONSHIP_CREATED)
 * DELETE ?objectId=  -> { ok: true } (canonical revocation event)
 * Like counts are projections computed from relationship events; the
 * counter itself is never canonical truth.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPingObjectReader, BadRequestError } from "@/lib/ping/ping-object-reader";
import { readerErrorResponse } from "@/lib/ping/api-errors";
import { getPracticeIdentityId } from "@/lib/ping/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireSessionId(): Promise<string> {
  const id = await getPracticeIdentityId();
  if (!id) throw new BadRequestError("No active practice identity. Select an identity first.");
  return id;
}

export async function POST(request: NextRequest) {
  try {
    const subjectId = await requireSessionId();
    const body = (await request.json().catch(() => null)) as { objectId?: unknown } | null;
    const objectId = typeof body?.objectId === "string" ? body.objectId : "";
    if (!objectId) throw new BadRequestError("objectId is required.");
    await getPingObjectReader().like(subjectId, objectId);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return readerErrorResponse(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const subjectId = await requireSessionId();
    const objectId = request.nextUrl.searchParams.get("objectId") || "";
    if (!objectId) throw new BadRequestError("objectId is required.");
    await getPingObjectReader().unlike(subjectId, objectId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return readerErrorResponse(err);
  }
}
