/**
 * GET /api/fyd/objects/[objectId]
 *
 * Public object projection. Resolves the id by site slug (legacy) or by
 * any public PING object id in any tenant. Returns the generic ObjectView:
 * identity, summary, media, services, contact, capabilities, and a quiet
 * provenance summary, plus the owner action history (human language) for
 * the Manage surface, plus the tenant siteId and the graph-enriched
 * ObjectProjection (services/people/external identities/location as
 * clickable related objects) for the object experience. No PING
 * engineering concepts leak into this payload.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadObjectViewBySlugOrId } from "@/fyd/object/by-id";
import { getPingObjectGraphSync } from "@/fyd/data/ping-object-source";
import { objectViewToProjection } from "@/fyd/object/object-projection";
import { readOverrides } from "@/fyd/object/owner-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ objectId: string }> },
) {
  const { objectId } = await params;
  const resolved = loadObjectViewBySlugOrId(objectId);
  if (!resolved) {
    return NextResponse.json({ ok: false, error: "Unknown object." }, { status: 404 });
  }
  const { view, siteId } = resolved;
  const history = readOverrides(objectId).history;
  let graph;
  try {
    graph = getPingObjectGraphSync(siteId).graph;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Projection unavailable." },
      { status: 503 },
    );
  }
  const projection = objectViewToProjection(view, graph);
  return NextResponse.json({ ok: true, view, history, siteId, projection });
}
