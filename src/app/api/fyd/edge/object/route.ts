/**
 * GET /api/fyd/edge/object?site=&objectId=
 *
 * Edge-object sheet: the compact object expansion. The sheet is built
 * through the public visibility gate inside buildObjectSheet (the same
 * rule the /sites pages use: only visibility "public" objects, only
 * relationships between public objects). An invisible object yields null,
 * mapped here to 404, indistinguishable from "unknown". No oracle, no
 * bypass.
 *
 * - 400: site or objectId missing/invalid.
 * - 404: object unknown or not visible to a public viewer.
 * - 503: the site's PING projection is unavailable (honest unknown).
 */

import { NextRequest, NextResponse } from "next/server";
import { getPingObjectGraphSync } from "@/fyd/data/ping-object-source";
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
  let graph;
  try {
    graph = getPingObjectGraphSync(site).graph;
  } catch {
    return NextResponse.json(
      { found: false, reason: "Projection unavailable." },
      { status: 503 },
    );
  }
  const sheet = buildObjectSheet(graph, objectId, EDGE_VISITOR);
  if (!sheet) {
    return NextResponse.json(
      {
        found: false,
        reason: "FYD has no record of that entry for this viewer.",
      },
      { status: 404 },
    );
  }
  return NextResponse.json(sheet);
}
