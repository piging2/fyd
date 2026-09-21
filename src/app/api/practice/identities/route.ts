/**
 * BFF: list and create PING practice identities.
 * GET  -> { identities: PingIdentitySummary[] }
 * POST -> { identity } (also becomes the active practice session identity)
 */

import { NextRequest, NextResponse } from "next/server";
import { getPingObjectReader } from "@/lib/ping/ping-object-reader";
import { readerErrorResponse } from "@/lib/ping/api-errors";
import { getPracticeIdentityId, setPracticeIdentityId } from "@/lib/ping/session";
import type { CreateIdentityInput } from "@/lib/ping/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const viewerId = await getPracticeIdentityId();
    const identities = await getPingObjectReader().listIdentities(viewerId);
    return NextResponse.json({ identities });
  } catch (err) {
    return readerErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Partial<CreateIdentityInput> | null;
    const input: CreateIdentityInput = {
      displayName: typeof body?.displayName === "string" ? body.displayName : "",
      handle: typeof body?.handle === "string" ? body.handle : "",
      bio: typeof body?.bio === "string" ? body.bio : "",
    };
    const identity = await getPingObjectReader().createIdentity(input);
    // Creating a test identity signs you in as it: name + handle + bio is the
    // whole morning flow. Keypair generation and dev custody stay server-side.
    await setPracticeIdentityId(identity.id);
    return NextResponse.json({ identity }, { status: 201 });
  } catch (err) {
    return readerErrorResponse(err);
  }
}
