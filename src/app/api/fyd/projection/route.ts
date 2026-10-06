import { NextResponse } from "next/server";
import { getVerifiedPublicProjection } from "@/fyd/data/ping-object-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/fyd/projection?siteId=<slug>
 *
 * Serves the VERIFIED PUBLIC projection for a demo site (Q-C-01): the
 * tenant object graph after the single public projection boundary
 * (source verification, owner field corrections, owner visibility
 * decisions, field visibility, traversal cuts, public-object filter),
 * plus the versioned projection receipt as `contract`. This is the only
 * projection any public consumer may read; the raw source graph is never
 * served to anonymous callers.
 *
 * The projection is produced by the PING-side dump
 * (/home/nolan/ping/tools/fyd-site-projection/dump.py), never hand-authored.
 * A missing or tampered projection is a 503, never a stale fallback.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const siteId = new URL(request.url).searchParams.get("siteId")?.trim() ?? "";
  if (!siteId) {
    return NextResponse.json(
      { ok: false, error: "siteId query parameter is required." },
      { status: 400 },
    );
  }
  try {
    const verified = await getVerifiedPublicProjection(siteId, "anonymous");
    const { provenance } = verified;
    return NextResponse.json({
      ok: true,
      siteId,
      contract: {
        boundaryVersion: provenance.boundaryVersion,
        viewerKind: provenance.viewerKind,
        checkpoint: provenance.checkpoint,
        graphDigest: provenance.graphDigest,
        decisionsDigest: provenance.decisionsDigest,
        viewerPolicyDigest: provenance.viewerPolicyDigest,
        capabilities: provenance.capabilities,
      },
      graph: verified.graph,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Projection unavailable.";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}

