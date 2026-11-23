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
 * Admission (hardening D9-F1): each admitted submit launches a background
 * compile (crawl + durable tenant writes), so anonymous submits pass the
 * shared AnonymousGate (the same boundary the build route and the
 * onboarding preview use) plus a small in-process in-flight compile cap
 * BEFORE the compiler launches. Refusals are HTTP 429 carrying
 * retryAfterMs, in this route's JSON envelope (ok/code/message) plus the
 * build route's error field, so both client contracts read them. An
 * admitted submit is unchanged: same background compile, same 202 shape.
 *
 * (Track F's POST /api/fyd/build SSE intake is a separate surface and is
 * untouched by this route.)
 */
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  buildTenant,
  isValidTenantId,
  tenantIdForUrl,
  tenantState,
  type CompileTenantDeps,
} from "@/fyd/onboarding/compile-tenant";
import { anonymousGate } from "@/fyd/net/rate-limit";
import {
  acquireInFlightCompile,
  inFlightCompileCount,
  releaseInFlightCompile,
} from "./in-flight-compiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Max concurrent presence compiles admitted by this process. */
const MAX_IN_FLIGHT_COMPILES = 2;
/** retryAfterMs reported when the in-flight cap refuses a submit. */
const IN_FLIGHT_RETRY_AFTER_MS = 60_000;

/**
 * Client key for the anonymous gate, resolved exactly as the build
 * route resolves it: sha256 of the first X-Forwarded-For hop (or
 * "unknown"), salted with the preview namespace so every anonymous
 * surface shares one gate identity.
 */
function clientKeyFor(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = (forwarded ? forwarded.split(",")[0] : null)?.trim() || "unknown";
  return createHash("sha256").update("fyd-preview-v1:" + ip).digest("hex");
}

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

  // Admission (D9-F1): gate check before the compiler launches; quota
  // is recorded exactly once, only for an admitted submit. A cap refusal
  // happens after the gate check (which may consume a bucket token, as
  // on the build path) but is never recorded as a generation.
  const clientKey = clientKeyFor(req);
  const gate = anonymousGate.check(clientKey);
  if (!gate.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: "rate-limited",
        message: gate.reason,
        error: gate.reason,
        retryAfterMs: gate.retryAfterMs,
      },
      { status: 429 },
    );
  }
  if (inFlightCompileCount() >= MAX_IN_FLIGHT_COMPILES) {
    return NextResponse.json(
      {
        ok: false,
        code: "too-many-compiles",
        message: "Too many tenant builds already in progress.",
        error: "Too many tenant builds already in progress.",
        retryAfterMs: IN_FLIGHT_RETRY_AFTER_MS,
      },
      { status: 429 },
    );
  }
  anonymousGate.record(clientKey);
  acquireInFlightCompile();
  let released = false;
  const releaseInFlight = (): void => {
    if (!released) {
      released = true;
      releaseInFlightCompile();
    }
  };

  // Run the pipeline in the background; the client polls GET for the real
  // checkpoint states. The per-tenant lock serializes concurrent submits.
  // The compiler records unexpected throws as FAILED checkpoints, so the
  // poll loop always terminates. The in-flight slot frees when the
  // compile settles, whichever way it settles.
  void buildTenant(url.trim(), deps())
    .catch((e: unknown) => {
      // Unreachable in practice (buildTenant fail-closes internally); logged
      // so an infrastructure fault is never silent.
      console.error("[fyd/presence] unexpected compiler throw", tenantId, e);
    })
    .finally(releaseInFlight);

  const state = tenantState(tenantId, deps());
  return NextResponse.json({ ok: true, ...state }, { status: 202 });
}

export function GET(req: NextRequest): NextResponse {
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
