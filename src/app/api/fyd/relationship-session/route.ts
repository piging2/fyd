import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, relationshipFailure } from "@/fyd/object/relationship-route";
import { createRelationshipViewer, relationshipCookie, resolveRelationshipViewer } from "@/fyd/object/relationship-viewer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Explicit session dependency. Ordinary follow/like reads never mint cookies. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const existing = resolveRelationshipViewer(request.headers.get("cookie"));
    const response = NextResponse.json({ ok: true, scope: "demo-session", accountConnected: false }, { headers: { "Cache-Control": "private, no-store" } });
    if (!existing) response.headers.set("Set-Cookie", relationshipCookie(createRelationshipViewer(), request.nextUrl.protocol === "https:"));
    return response;
  } catch (error) { return relationshipFailure(error); }
}
