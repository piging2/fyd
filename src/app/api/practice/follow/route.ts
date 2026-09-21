/**
 * BFF: follow / unfollow as the session identity.
 * POST   { targetId } -> { relationshipId } (canonical RELATIONSHIP_CREATED)
 * DELETE ?targetId=  -> { ok: true }        (canonical revocation event)
 * Each follow is its own canonical relationship; there is no batch fakery.
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
    const body = (await request.json().catch(() => null)) as { targetId?: unknown } | null;
    const targetId = typeof body?.targetId === "string" ? body.targetId : "";
    if (!targetId) throw new BadRequestError("targetId is required.");
    const result = await getPingObjectReader().follow(subjectId, targetId);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return readerErrorResponse(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const subjectId = await requireSessionId();
    const targetId = request.nextUrl.searchParams.get("targetId") || "";
    if (!targetId) throw new BadRequestError("targetId is required.");
    await getPingObjectReader().unfollow(subjectId, targetId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return readerErrorResponse(err);
  }
}
