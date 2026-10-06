/**
 * POST /api/fyd/presence  { "url": "https://example.com/" }
 * GET  /api/fyd/presence?tenantId=url-<16hex>
 *
 * The P-01 one-box seam: PASTE URL -> BUILD MY FYD.
 *
 * POST validates and normalizes (pure, instant), kicks off the presence
 * compiler in the background, and returns the current checkpoint state
 * immediately (202). The client polls GET for the real progressive states
 * (ANALYZING -> UNDERSTANDING -> BUILDING -> READY, or FAILED). Every
 * state the client renders comes from the on-disk checkpoint; there are
 * no timers and no invented transitions.
 *
 * Idempotency: the tenant id is deterministic from the normalized URL, so
 * double submits (and concurrent ones) converge on one tenant via the
 * per-tenant compiler lock. A retry after failure resumes from the
 * recorded failed stage.
 *
 * (Track F's POST /api/fyd/build SSE intake is a separate surface and is
 * untouched by this route.)
 */
import { NextRequest, NextResponse } from "next/server";
import {
  buildTenant,
  isValidTenantId,
  tenantIdForUrl,
  tenantState,
  type CompileTenantDeps,
} from "@/fyd/onboarding/compile-tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deps(): CompileTenantDeps {
  // Same default as the projection seam (ping-object-source): the compiler
  // writes where the serving routes read.
  return {
    projectionDir:
      process.env.FYD_PROJECTION_DIR ?? "/home/nolan/ping/var/fyd-projections",
  };
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
      { ok: false, code: "invalid-url", message: "Paste the business website URL first." },
      { status: 400 },
    );
  }

  const tenantId = tenantIdForUrl(url);
  if (!tenantId) {
    return NextResponse.json(
      { ok: false, code: "invalid-url", message: "That URL could not be understood. Use a full http(s) address." },
      { status: 400 },
    );
  }

  // Run the pipeline in the background; the client polls GET for the real
  // checkpoint states. The per-tenant lock serializes concurrent submits.
  // The compiler records unexpected throws as FAILED checkpoints, so the
  // poll loop always terminates.
  void buildTenant(url.trim(), deps()).catch((e: unknown) => {
    // Unreachable in practice (buildTenant fail-closes internally); logged
    // so an infrastructure fault is never silent.
    console.error("[fyd/presence] unexpected compiler throw", tenantId, e);
  });

  const state = tenantState(tenantId, deps());
  return NextResponse.json({ ok: true, ...state }, { status: 202 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = new URL(req.url).searchParams.get("tenantId") ?? "";
  if (!isValidTenantId(tenantId)) {
    return NextResponse.json(
      { ok: false, code: "invalid-tenant", message: "A valid tenantId query parameter is required." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({ ok: true, ...tenantState(tenantId, deps()) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, code: "internal", message: e instanceof Error ? e.message : "State lookup failed." },
      { status: 500 },
    );
  }
}
