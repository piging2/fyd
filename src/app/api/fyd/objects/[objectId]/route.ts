/**
 * GET /api/fyd/objects/[objectId]
 *
 * Public object projection (Q-C-01). Resolves the id by site slug (legacy)
 * or by any public PING object id in any tenant, through the single public
 * projection boundary: every view and projection below is composed from a
 * VerifiedPublicProjection, never from a raw source graph. Returns the
 * generic ObjectView (identity, summary, media, services, contact,
 * capabilities, quiet provenance summary) plus the tenant siteId and the
 * graph-enriched ObjectProjection for the object experience, plus the
 * versioned projection receipt as `contract`.
 *
 * Owner history is NEVER served here: it is owner-management material and
 * lives on the owner-lane GET .../overrides. No PING engineering concepts
 * leak into this payload.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadObjectViewBySlugOrId } from "@/fyd/object/by-id";
import { getVerifiedPublicProjectionSync } from "@/fyd/data/ping-object-source";
import type { VerifiedPublicProjection } from "@/fyd/sitespec/public-projection";
import { objectViewToProjection } from "@/fyd/object/object-projection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ objectId: string }> },
) {
  const { objectId } = await params;
  // Memoized boundary resolver: the cross-tenant scan must not re-verify a
  // tenant it already projected.
  const cache = new Map<string, VerifiedPublicProjection | null>();
  const resolveProjection = (
    siteId: string,
  ): VerifiedPublicProjection | null => {
    if (!cache.has(siteId)) {
      try {
        cache.set(
          siteId,
          getVerifiedPublicProjectionSync(siteId, "anonymous"),
        );
      } catch {
        cache.set(siteId, null);
      }
    }
    return cache.get(siteId) ?? null;
  };
  const resolved = loadObjectViewBySlugOrId(objectId, resolveProjection);
  if (!resolved) {
    return NextResponse.json(
      { ok: false, error: "Unknown object." },
      { status: 404 },
    );
  }
  const { view, siteId } = resolved;
  const verified = resolveProjection(siteId);
  if (!verified) {
    return NextResponse.json(
      { ok: false, error: "Projection unavailable." },
      { status: 503 },
    );
  }
  const projection = objectViewToProjection(view, verified.graph);
  const { provenance } = verified;
  return NextResponse.json({
    ok: true,
    view,
    siteId,
    projection,
    contract: {
      boundaryVersion: provenance.boundaryVersion,
      viewerKind: provenance.viewerKind,
      checkpoint: provenance.checkpoint,
      graphDigest: provenance.graphDigest,
      decisionsDigest: provenance.decisionsDigest,
      viewerPolicyDigest: provenance.viewerPolicyDigest,
      capabilities: provenance.capabilities,
    },
  });
}

