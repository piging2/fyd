/**
 * BFF: human approval for Ask PING proposals. The digest is re-verified
 * server-side; any modification after drafting fails. Owner-only updates
 * are enforced before the governed signed envelope is submitted as the
 * viewer identity. Agents propose; they cannot publish.
 * POST { proposal: AskProposal } -> { eventId: string }.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPingObjectReader, BadRequestError } from "@/lib/ping/ping-object-reader";
import { readerErrorResponse } from "@/lib/ping/api-errors";
import { getPracticeIdentityId } from "@/lib/ping/session";
import type { AskProposal } from "@/lib/ping/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isProposal(v: unknown): v is AskProposal {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    (r.kind === "object_update" || r.kind === "object_create") &&
    typeof r.schema === "string" &&
    typeof r.digest === "string" &&
    typeof r.changes === "object" &&
    r.changes !== null
  );
}

export async function POST(request: NextRequest) {
  try {
    const viewerId = await getPracticeIdentityId();
    if (!viewerId) throw new BadRequestError("No active identity. Select an identity first.");
    const body: unknown = await request.json().catch(() => null);
    const rec = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
    if (!isProposal(rec.proposal)) throw new BadRequestError("proposal is required and must be a drafted AskProposal.");
    const result = await getPingObjectReader().submitProposal(viewerId, rec.proposal);
    return NextResponse.json(result);
  } catch (err) {
    return readerErrorResponse(err);
  }
}
