/**
 * FYD social: read one identity's social state.
 * GET ?identityId= -> { identityId, identity, profile, following, followers,
 *                        followingCount, followerCount, source }
 *
 * Every value is read live from the PING journal (ping_events) on the
 * repo-booted gateway. Counts are projections over journaled
 * RELATIONSHIP_CREATED events with last-wins netting; nothing here is
 * hardcoded and no fake activity is synthesized. Absence reads as absence.
 */

import { NextRequest, NextResponse } from "next/server";
import { readSocialState } from "@/fyd/social/readers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const identityId = request.nextUrl.searchParams.get("identityId") || "";
    if (!identityId) {
      return NextResponse.json(
        { ok: false, error: "identityId is required." },
        { status: 400 },
      );
    }
    const state = await readSocialState(identityId);
    if (!state.identity.found && !state.profile.found) {
      return NextResponse.json(
        { ok: false, error: `unknown identity "${identityId}"`, source: "ping_events" },
        { status: 404 },
      );
    }
    return NextResponse.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
