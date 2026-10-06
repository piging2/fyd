/**
 * GET /api/fyd/edge/object?site=&objectId=
 *
 * Edge-object sheet: the compact object expansion. The sheet is built by
 * buildObjectSheet over a VERIFIED public projection (Q-C-01): only
 * visibility "public" objects, only endpoint-safe active relationships,
 * owner-hidden fields already removed at the boundary. An invisible object
 * yields null, mapped here to 404, indistinguishable from "unknown". No
 * oracle, no bypass.
 *
 * - 400: site or objectId missing/invalid.
 * - 404: object unknown or not visible to a public viewer.
 * - 503: the site's PING projection is unavailable (honest unknown).
 */

import { NextRequest, NextResponse } from "next/server";
import { getVerifiedPublicProjectionSync } from "@/fyd/data/ping-object-source";
import {
  buildObjectSheet,
  EDGE_VISITOR,
} from "@/fyd/edge/resolve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The authorized FYD demo tenants (same list as /sites page.tsx). */
const DEMO_SITES: ReadonlySet<string> = new Set([
  "happy-place",
  "coppersmith-plumbing",
]);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const site = request.nextUrl.searchParams.get("site") ?? "";
  const objectId = request.nextUrl.searchParams.get("objectId") ?? "";
  if (!site || !DEMO_SITES.has(site) || !objectId) {
    return NextResponse.json(
      { found: false, reason: "site and objectId are required" },
      { status: 400 },
    );
  }
  let verified;
  try {
    verified = getVerifiedPublicProjectionSync(site, "anonymous");
  } catch {
    return NextResponse.json(
      { found: false, reason: "Projection unavailable." },
      { status: 503 },
    );
  }
  const sheet = buildObjectSheet(verified, objectId, EDGE_VISITOR);
  if (!sheet) {
    return NextResponse.json(
      {
        found: false,
        reason: "FYD has no record of that entry for this viewer.",
      },
      { status: 404 },
    );
  }
  const { provenance } = verified;
  return NextResponse.json({
    ...sheet,
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

