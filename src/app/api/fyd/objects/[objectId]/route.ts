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
import { loadObjectViewById } from "@/fyd/object/by-id";
import { loadObjectView } from "@/fyd/object/view";
import { getSiteBundle, listSiteIds } from "@/fyd/media/site-bundle";
import { objectViewToProjection } from "@/fyd/object/object-projection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ objectId: string }> },
) {
  const { objectId } = await params;
  const ids = listSiteIds();
  let resolved: { view: NonNullable<ReturnType<typeof loadObjectView>>; siteId: string; verified: NonNullable<Awaited<ReturnType<typeof getSiteBundle>>>["projection"] } | null = null;
  let unavailable = false;
  for (const siteId of ids.includes(objectId) ? [objectId] : ids) {
    try {
      const bundle = await getSiteBundle(siteId);
      if (!bundle?.projection) continue;
      const view = siteId === objectId
        ? loadObjectView(bundle.projection, siteId, bundle.readOwner)
        : loadObjectViewById(bundle.projection, siteId, objectId, bundle.readOwner);
      if (view) { resolved = { view, siteId, verified: bundle.projection }; break; }
    } catch { unavailable = true; }
  }
  if (!resolved?.verified) return NextResponse.json(
    { ok: false, error: unavailable ? "Business information unavailable." : "Unknown object." },
    { status: unavailable ? 503 : 404 },
  );
  const { view, siteId, verified } = resolved;
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

