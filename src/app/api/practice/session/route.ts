/**
 * BFF: practice session (dev identity selector).
 * GET    -> { identityId, identity } | { identityId: null, identity: null }
 * POST   -> { identityId } (select an already-existing dev identity)
 * DELETE -> { ok: true } (sign out of the practice session)
 */

import { NextRequest, NextResponse } from "next/server";
import { getPingObjectReader, BadRequestError } from "@/lib/ping/ping-object-reader";
import { readerErrorResponse } from "@/lib/ping/api-errors";
import { clearPracticeIdentityId, getPracticeIdentityId, setPracticeIdentityId } from "@/lib/ping/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const identityId = await getPracticeIdentityId();
    if (!identityId) return NextResponse.json({ identityId: null, identity: null });
    const identities = await getPingObjectReader().listIdentities(identityId);
    const identity = identities.find((i) => i.id === identityId) ?? null;
    if (!identity) {
      // The session points at an identity the gateway no longer knows.
      // Drop the stale cookie rather than stranding the user.
      await clearPracticeIdentityId();
      return NextResponse.json({ identityId: null, identity: null });
    }
    return NextResponse.json({ identityId, identity });
  } catch (err) {
    return readerErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { identityId?: unknown } | null;
    const identityId = typeof body?.identityId === "string" ? body.identityId : "";
    if (!identityId) throw new BadRequestError("identityId is required.");
    // Only already-existing identities can be selected. The selector never
    // invents an identity and never grants capabilities.
    const identities = await getPingObjectReader().listIdentities(identityId);
    const found = identities.some((i) => i.id === identityId);
    if (!found) throw new BadRequestError("Unknown identity. Create it first, then select it.");
    await setPracticeIdentityId(identityId);
    return NextResponse.json({ identityId });
  } catch (err) {
    return readerErrorResponse(err);
  }
}

export async function DELETE() {
  await clearPracticeIdentityId();
  return NextResponse.json({ ok: true });
}
