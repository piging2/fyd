/**
 * FYD social: follow / unfollow.
 * POST   { actorId, targetId } -> 201 { ok:true, deduped, actionId, relationshipId, status, eventId, sequence }
 * DELETE ?actorId=&targetId=   -> 200 { ok:true, ... }  (canonical revocation: status 'inactive')
 *
 * Real PING path: signed bff-envelope@1 RELATIONSHIP_CREATED (predicate
 * 'follows') submitted to the repo-booted gateway. Every success is
 * attested: the journal is re-read and the named preconditions checked
 * before ok:true is returned. A failed follow returns ok:false with the
 * missing evidence named (HTTP 502) — never a false success.
 */

import { NextRequest, NextResponse } from "next/server";
import { followIdentity, unfollowIdentity, EnvelopeRejectedError } from "@/fyd/social/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      actorId?: unknown;
      targetId?: unknown;
    } | null;
    const actorId = typeof body?.actorId === "string" ? body.actorId : "";
    const targetId = typeof body?.targetId === "string" ? body.targetId : "";
    if (!actorId || !targetId) {
      return NextResponse.json(
        { ok: false, error: "actorId and targetId are required." },
        { status: 400 },
      );
    }
    const result = await followIdentity(actorId, targetId);
    if (!result.ok) {
      return NextResponse.json(result, { status: 502 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    const status = err instanceof EnvelopeRejectedError ? 502 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actorId = request.nextUrl.searchParams.get("actorId") || "";
    const targetId = request.nextUrl.searchParams.get("targetId") || "";
    if (!actorId || !targetId) {
      return NextResponse.json(
        { ok: false, error: "actorId and targetId are required." },
        { status: 400 },
      );
    }
    const result = await unfollowIdentity(actorId, targetId);
    if (!result.ok) {
      return NextResponse.json(result, { status: 502 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    const status = err instanceof EnvelopeRejectedError ? 502 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
