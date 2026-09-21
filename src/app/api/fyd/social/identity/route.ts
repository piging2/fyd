/**
 * FYD social: mint a dev identity.
 * POST { displayName, handle, bio? } -> 201 { identityId, displayName, handle, eventId, profileEventId }
 *
 * Real PING path: POST /identities on the repo-booted gateway (IdentityAuthority
 * mints identity_<16hex>), dev keypair escrowed server-side in FYD_DEV_KEY_DIR,
 * profile published as a signed ping.social.profile@1 OBJECT_CREATED envelope.
 * Dev identities only. Never Nolan's identity, never a real person's key.
 */

import { NextRequest, NextResponse } from "next/server";
import { createFydIdentity } from "@/fyd/social/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      displayName?: unknown;
      handle?: unknown;
      bio?: unknown;
    } | null;
    const result = await createFydIdentity({
      displayName: typeof body?.displayName === "string" ? body.displayName : "",
      handle: typeof body?.handle === "string" ? body.handle : "",
      bio: typeof body?.bio === "string" ? body.bio : "",
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
