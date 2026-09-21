/**
 * BFF: update the session identity's bio through the canonical object path.
 * PATCH { bio } -> { ok: true }
 * Only the active identity can edit its own bio.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPingObjectReader, BadRequestError } from "@/lib/ping/ping-object-reader";
import { readerErrorResponse } from "@/lib/ping/api-errors";
import { getPracticeIdentityId } from "@/lib/ping/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  try {
    const identityId = await getPracticeIdentityId();
    if (!identityId) throw new BadRequestError("No active practice identity. Select an identity first.");
    const body = (await request.json().catch(() => null)) as { bio?: unknown } | null;
    const bio = typeof body?.bio === "string" ? body.bio : "";
    await getPingObjectReader().updateBio(identityId, bio);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return readerErrorResponse(err);
  }
}
