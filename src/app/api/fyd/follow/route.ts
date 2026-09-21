import { NextRequest, NextResponse } from "next/server";
import { FollowError, isFollowing, setFollowing } from "@/fyd/object/follows";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OBJECT_ID_PATTERN = /^[a-z0-9-]+$/;

type Action = "follow" | "unfollow";

/**
 * GET /api/fyd/follow?objectId=xxx
 *
 * Answers about ONE object only: is the local viewer following it?
 * The endpoint never exposes other viewers and never lists all follows.
 *
 * Response: { ok: true, following: boolean }
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
    return NextResponse.json({ ok: true, following: isFollowing(objectId) });
  } catch (e) {
    if (e instanceof FollowError) {
      return NextResponse.json({ ok: false, error: "Unknown object." }, { status: 404 });
    }
    throw e;
  }
}

/**
 * POST /api/fyd/follow
 *
 * Body: { objectId: string, action: "follow" | "unfollow" }
 * Response: { ok: true, following: boolean }
 * Errors: 400 bad action/shape, 404 unknown object.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const record =
    typeof body === "object" && body !== null ? body : {};
  const r = record as Record<string, unknown>;
  const objectId = typeof r.objectId === "string" ? r.objectId : "";
  const action: Action | unknown = r.action;

  if (!objectId || !OBJECT_ID_PATTERN.test(objectId)) {
    return NextResponse.json(
      { ok: false, error: "objectId is required and must be lowercase letters, digits, or dashes." },
      { status: 400 },
    );
  }
  if (action !== "follow" && action !== "unfollow") {
    return NextResponse.json(
      { ok: false, error: "action must be follow or unfollow." },
      { status: 400 },
    );
  }
  try {
    const result = setFollowing(objectId, action === "follow");
    return NextResponse.json({ ok: true, following: result.following });
  } catch (e) {
    if (e instanceof FollowError) {
      return NextResponse.json({ ok: false, error: "Unknown object." }, { status: 404 });
    }
    throw e;
  }
}
