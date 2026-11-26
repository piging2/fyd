import { NextResponse } from "next/server";
import { probeFeaturedVideoFetch } from "@/lib/latest-video";

export const dynamic = "force-dynamic";

/**
 * GET /api/featured-video: the featured-video sync, observable at
 * destination. Runs the channel feed fetch in this runtime in two
 * forms (the resolver's cached form and a plain no-store form) and
 * reports each outcome, so whether the in-runtime fetch can succeed
 * is read from evidence, not assumed. Public video metadata only.
 */
export async function GET() {
  const probe = await probeFeaturedVideoFetch();
  return NextResponse.json(probe, { status: 200 });
}
