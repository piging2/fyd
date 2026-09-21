/**
 * FYD social: visibility-aware feed for one identity.
 * GET ?identityId=&limit= -> { posts: [{ objectId, authorId, text, createdAt, likeCount, source }] }
 *
 * Read live from the PING journal: own public posts plus public posts by
 * actively followed identities, newest-first with object-id tiebreak. Like
 * counts are projections from net 'likes' edges. No ranking, no synthesis,
 * no fake posts.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFeed } from "@/fyd/social/readers";

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
    const limitRaw = request.nextUrl.searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitRaw || "50", 10) || 50, 1), 200);
    const posts = await readFeed(identityId, limit);
    return NextResponse.json({ posts, source: "ping_events" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
