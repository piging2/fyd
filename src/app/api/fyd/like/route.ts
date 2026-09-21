import { NextRequest, NextResponse } from "next/server";
import { LikeError, isLiked, setLiked } from "@/fyd/object/likes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OBJECT_ID_PATTERN = /^[a-z0-9-]+$/;

type Action = "like" | "unlike";

/**
 * GET /api/fyd/like?objectId=xxx
 *
 * Answers about ONE object only: has the local viewer liked it?
 * The endpoint never exposes other viewers and never lists all likes.
 *
 * Response: { ok: true, liked: boolean }
 * Errors: 400 missing/invalid objectId, 404 unknown object.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const objectId = request.nextUrl.searchParams.get("objectId") ?? "";
  if (!objectId || !OBJECT_ID_PATTERN.test(objectId)) {
    return NextResponse.json(
      { ok: false, error: "objectId is required and must be lowercase letters, digits, or dashes." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({ ok: true, liked: isLiked(objectId) });
  } catch (e) {
    if (e instanceof LikeError) {
      return NextResponse.json({ ok: false, error: "Unknown object." }, { status: 404 });
    }
    throw e;
  }
}

/**
 * POST /api/fyd/like
 *
 * Body: { objectId: string, action: "like" | "unlike" }
 * Response: { ok: true, liked: boolean }
 * Errors: 400 bad action/shape, 404 unknown object.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const record = typeof body === "object" && body !== null ? body : {};
  const r = record as Record<string, unknown>;
  const objectId = typeof r.objectId === "string" ? r.objectId : "";
  const action: Action | unknown = r.action;

  if (!objectId || !OBJECT_ID_PATTERN.test(objectId)) {
    return NextResponse.json(
      { ok: false, error: "objectId is required and must be lowercase letters, digits, or dashes." },
      { status: 400 },
    );
  }
  if (action !== "like" && action !== "unlike") {
    return NextResponse.json(
      { ok: false, error: 'action must be "like" or "unlike".' },
      { status: 400 },
    );
  }
  try {
    const liked = setLiked(objectId, action === "like");
    return NextResponse.json({ ok: true, liked });
  } catch (e) {
    if (e instanceof LikeError) {
      return NextResponse.json({ ok: false, error: "Unknown object." }, { status: 404 });
    }
    throw e;
  }
}
