/**
 * BFF: Ask PING. Server-side bounded context builder plus the deterministic
 * evidence-backed answer composer.
 * POST { question: string, targetObjectId?: string } -> AskAnswer.
 * The composer never fabricates: no evidence means an honest partial answer.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPingObjectReader, BadRequestError } from "@/lib/ping/ping-object-reader";
import { readerErrorResponse } from "@/lib/ping/api-errors";
import { getPracticeIdentityId } from "@/lib/ping/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const viewerId = await getPracticeIdentityId();
    const body: unknown = await request.json().catch(() => null);
    const rec = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
    const question = typeof rec.question === "string" ? rec.question : "";
    if (!question.trim()) throw new BadRequestError("question is required.");
    if (question.length > 2000) throw new BadRequestError("question is too long (max 2000 chars).");
    const targetObjectId = typeof rec.targetObjectId === "string" ? rec.targetObjectId : null;
    const answer = await getPingObjectReader().ask(question.trim(), viewerId, targetObjectId);
    return NextResponse.json(answer);
  } catch (err) {
    return readerErrorResponse(err);
  }
}
