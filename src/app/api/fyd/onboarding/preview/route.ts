/**
 * POST /api/fyd/onboarding/preview
 *
 * Anonymous URL preview (onboarding order G). No authentication, no
 * consequential action: returns the evidence preview or a typed failure.
 * Abuse handling is owned by fyd/net (gate, SSRF gate, budgets); this route
 * only maps outcomes to HTTP.
 *
 * Body: { "url": "https://example.com/" }
 */
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  generateAnonymousPreview,
  type PreviewOutcome,
} from "@/fyd/onboarding/anonymous-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIdFor(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = (forwarded ? forwarded.split(",")[0] : null)?.trim() || "unknown";
  return createHash("sha256").update("fyd-preview-v1:" + ip).digest("hex");
}

function statusFor(outcome: Extract<PreviewOutcome, { ok: false }>): number {
  switch (outcome.code) {
    case "rate-limited":
      return 429;
    case "invalid-url":
      return 400;
    case "budget-exhausted":
      return 503;
    case "fetch-failed":
      return 502;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let url: unknown;
  try {
    const body: unknown = await req.json();
    url = (body as { url?: unknown } | null)?.url;
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid-url", message: "Request body must be JSON with a url field." },
      { status: 400 },
    );
  }
  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json(
      { ok: false, code: "invalid-url", message: "A url field is required." },
      { status: 400 },
    );
  }

  const outcome = await generateAnonymousPreview({
    url: url.trim(),
    clientId: clientIdFor(req),
  });

  if (!outcome.ok) {
    const headers: Record<string, string> = {};
    if (outcome.code === "rate-limited" && outcome.retryAfterMs) {
      headers["Retry-After"] = String(Math.ceil(outcome.retryAfterMs / 1000));
    }
    return NextResponse.json(outcome, { status: statusFor(outcome), headers });
  }
  return NextResponse.json(outcome);
}
