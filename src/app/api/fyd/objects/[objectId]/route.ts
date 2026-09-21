/**
 * GET /api/fyd/objects/[objectId]
 *
 * Public object projection. Returns the generic ObjectView: identity,
 * summary, media, services, contact, capabilities, and a quiet provenance
 * summary, plus the owner action history (human language) for the Manage
 * surface. No PING engineering concepts leak into this payload.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadObjectView } from "@/fyd/object/view";
import { readOverrides } from "@/fyd/object/owner-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ objectId: string }> },
) {
  const { objectId } = await params;
  const view = loadObjectView(objectId);
  if (!view) {
    return NextResponse.json({ ok: false, error: "Unknown object." }, { status: 404 });
  }
  const history = readOverrides(objectId).history;
  return NextResponse.json({ ok: true, view, history });
}
