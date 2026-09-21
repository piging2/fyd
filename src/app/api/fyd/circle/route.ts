/**
 * FYD Circle projection endpoint: the deploy-anywhere integration boundary.
 *
 * GET /api/fyd/circle?id=<objectId> returns { ok: true, projection } where
 * projection is the public-safe CircleProjection built by loadCircleProjection
 * (see src/fyd/object/view.ts). CORS is open for public embedding; the
 * projection carries public-safe data only.
 */

import { NextResponse } from "next/server";
import { loadCircleProjection } from "@/fyd/object/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
};

function json(
  body: unknown,
  status: number,
): NextResponse {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id || id.trim().length === 0) {
    return json({ ok: false, error: "missing or invalid id" }, 400);
  }
  const projection = loadCircleProjection(id);
  if (!projection) {
    return json({ ok: false, error: "object not found" }, 404);
  }
  return json({ ok: true, projection }, 200);
}
