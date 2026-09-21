/**
 * FYD social: publish a post.
 * POST { identityId, text, visibility? } -> 201 { ok:true, actionId, objectId, eventId, sequence }
 *
 * Real PING path: signed bff-envelope@1 OBJECT_CREATED (schema
 * ping.social.post@1) submitted to the repo-booted gateway. Attested before
 * success: the journal is re-read and the post's presence confirmed.
 */

import { NextRequest, NextResponse } from "next/server";
import { createFydPost, EnvelopeRejectedError } from "@/fyd/social/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      identityId?: unknown;
      text?: unknown;
      visibility?: unknown;
    } | null;
    const identityId = typeof body?.identityId === "string" ? body.identityId : "";
    const text = typeof body?.text === "string" ? body.text : "";
    const visibility =
      body?.visibility === "followers" || body?.visibility === "private"
        ? body.visibility
        : "public";
    if (!identityId || !text.trim()) {
      return NextResponse.json(
        { ok: false, error: "identityId and non-empty text are required." },
        { status: 400 },
      );
    }
    const result = await createFydPost(identityId, text, { visibility });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    const status = err instanceof EnvelopeRejectedError ? 502 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
